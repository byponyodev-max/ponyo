import "server-only";

import { cookies } from "next/headers";
import { getProductById, getProducts } from "@/services/product.service";
import { requestAppTranslations, type AppTranslationEntry } from "@/services/app-translations.server";
import { PONYO_API_BASE_URL, ponyoApi, type ProductCategory } from "@/services/ponyo-api.client";
import { previewTranslatableFields, reviewedPreviewTranslations } from "@/services/preview-product-translations";
import type { Product } from "@/types/product";
import { PRODUCT_CATEGORY_DEFINITIONS } from "@/lib/product-categories";

function categorizePreviewProduct(product: Product): Product {
	const tags = product.tags ?? [];
	const text = `${product.name} ${product.categoryName} ${product.productType ?? ""}`.toLowerCase();
	const categorySlug = product.sizeTier?.toLowerCase() === "xl" || tags.includes("domina-xl")
		? "giant-plush"
		: tags.includes("character") || text.includes("character")
			? "character-plush"
			: "collectible-plush";
	return { ...product, categoryId: categorySlug, categorySlug };
}

async function localizePreviewProducts(products: Product[], locale: string) {
	if (locale !== "ja" && locale !== "ko") return products;

	const reviewedTranslations = reviewedPreviewTranslations[locale];
	const entries: AppTranslationEntry[] = [];
	for (const product of products) {
		for (const field of previewTranslatableFields) {
			const text = product[field];
			if (typeof text === "string" && text) {
				entries.push({
					key: `preview.product.${product.slug}.${field}`,
					text,
				});
			}
		}
		for (const [index, image] of (product.galleryImages ?? []).entries()) {
			if (image.alt) {
				entries.push({
					key: `preview.product.${product.slug}.gallery.${index}.alt`,
					text: image.alt,
				});
			}
		}
	}

	const translated: Record<string, string> = {};
	for (let index = 0; index < entries.length; index += 24) {
		Object.assign(
			translated,
			await requestAppTranslations(locale, entries.slice(index, index + 24)),
		);
	}

	return products.map((product) => {
		const localized = { ...product };
		const reviewed = reviewedTranslations[product.slug] ?? {};
		for (const field of previewTranslatableFields) {
			const key = `preview.product.${product.slug}.${field}`;
			const value = reviewed[field] || translated[key];
			if (value) Object.assign(localized, { [field]: value });
		}
		if (product.galleryImages) {
			localized.galleryImages = product.galleryImages.map((image, index) => ({
				...image,
				alt:
					reviewed.imageAlt ||
					translated[`preview.product.${product.slug}.gallery.${index}.alt`] ||
					image.alt,
			}));
		}
		return localized;
	});
}

async function selectedLocale() {
	return (await cookies()).get("ponyo-language")?.value ?? "en";
}

export async function getLocalizedProducts(query = "", locale?: string) {
	const language = locale ?? await selectedLocale();
	const products = await getProducts(query, language);
	return PONYO_API_BASE_URL
		? products
		: localizePreviewProducts(products.map(categorizePreviewProduct), language);
}

export async function getProductCategories(): Promise<ProductCategory[]> {
	if (PONYO_API_BASE_URL) return ponyoApi.listProductCategories();
	return PRODUCT_CATEGORY_DEFINITIONS.map((category) => ({
		id: category.slug,
		slug: category.slug,
		name: category.name,
		parentId: category.parentSlug ?? null,
		productCount: 0,
	}));
}

export async function getLocalizedProductById(id: string, locale?: string) {
	const language = locale ?? await selectedLocale();
	if (PONYO_API_BASE_URL) {
		return getProductById(id, language);
	}
	const products = await getLocalizedProducts("", language);
	return products.find((product) => product.id === id || product.slug === id);
}