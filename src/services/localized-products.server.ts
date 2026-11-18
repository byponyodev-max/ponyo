import "server-only";

import { cookies } from "next/headers";
import { getProductById, getProducts } from "@/services/product.service";
import { requestAppTranslations, type AppTranslationEntry } from "@/services/app-translations.server";
import { PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { previewTranslatableFields, reviewedPreviewTranslations } from "@/services/preview-product-translations";
import type { Product } from "@/types/product";

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
			const value = translated[key] || reviewed[field];
			if (value) Object.assign(localized, { [field]: value });
		}
		if (product.galleryImages) {
			localized.galleryImages = product.galleryImages.map((image, index) => ({
				...image,
				alt:
					translated[`preview.product.${product.slug}.gallery.${index}.alt`] ||
					reviewed.imageAlt ||
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
		: localizePreviewProducts(products, language);
}

export async function getLocalizedProductById(id: string, locale?: string) {
	const language = locale ?? await selectedLocale();
	if (PONYO_API_BASE_URL) {
		return getProductById(id, language);
	}
	const products = await getLocalizedProducts("", language);
	return products.find((product) => product.id === id || product.slug === id);
}