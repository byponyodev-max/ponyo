import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function compile(sourcePath, context) {
	const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	});
	vm.runInNewContext(outputText, context);
	return context.exports;
}

function loadPreviewCatalog() {
	const productService = compile("../src/services/product.service.ts", {
		exports: {},
		require: (id) => {
			if (id === "@/services/ponyo-api.client") {
				return { PONYO_API_BASE_URL: "", ponyoApi: {} };
			}
			throw new Error(`Unexpected dependency: ${id}`);
		},
	});
	const translationCatalog = compile("../src/services/preview-product-translations.ts", {
		exports: {},
		require: () => ({}),
	});
	return { productService, translationCatalog };
}

function loadProductsRoute({ apiBase = "", translations = async () => ({}) } = {}) {
	const { productService, translationCatalog } = loadPreviewCatalog();
	const translationRequests = [];
	const service = compile("../src/services/localized-products.server.ts", {
		exports: {},
		require: (id) => {
			if (id === "server-only") return {};
			if (id === "next/headers") {
				return { cookies: async () => ({ get: () => ({ value: "en" }) }) };
			}
			if (id === "@/services/product.service") return productService;
			if (id === "@/services/ponyo-api.client") return { PONYO_API_BASE_URL: apiBase };
			if (id === "@/services/preview-product-translations") return translationCatalog;
			if (id === "@/services/app-translations.server") {
				return {
					requestAppTranslations: async (locale, entries) => {
						translationRequests.push({ locale, entries });
						return translations(locale, entries);
					},
				};
			}
			throw new Error(`Unexpected dependency: ${id}`);
		},
	});
	const route = compile("../src/app/api/products/route.ts", {
		exports: {},
		URL,
		require: (id) => {
			if (id === "next/server") {
				return {
					NextResponse: {
						json: (payload) => new Response(JSON.stringify(payload), {
							headers: { "Content-Type": "application/json" },
						}),
					},
				};
			}
			if (id === "@/services/localized-products.server") return service;
			throw new Error(`Unexpected dependency: ${id}`);
		},
	});
	return { ...route, productService, translationCatalog, translationRequests };
}

test("reviewed Japanese and Korean preview translations cover every catalog field", async () => {
	for (const locale of ["ja", "ko"]) {
		const cachedKey = `preview.product.haneul-bunny.name`;
		const cachedName = `cached ${locale} Haneul Bunny`;
		const translationCache = new Map([[`${locale}:${cachedKey}`, cachedName]]);
		let providerCalls = 0;
		const mockedProvider = async () => {
			providerCalls += 1;
			return {};
		};
		const service = loadProductsRoute({
			translations: async (requestedLocale, entries) => {
				assert.equal(requestedLocale, locale);
				const result = {};
				const misses = [];
				for (const entry of entries) {
					const cached = translationCache.get(`${locale}:${entry.key}`);
					if (cached) result[entry.key] = cached;
					else misses.push(entry);
				}
				if (misses.length > 0) {
					Object.assign(result, await mockedProvider(requestedLocale, misses));
				}
				return result;
			},
		});
		const response = await service.GET(new Request(`http://localhost/api/products?locale=${locale}`));
		const payload = await response.json();
		const sourceProducts = service.productService.storefrontPreviewProducts;

		assert.equal(response.status, 200);
		assert.equal(payload.data.length, sourceProducts?.length);
		assert.ok(service.translationRequests.length > 0);
		assert.ok(service.translationRequests.every((batch) => batch.locale === locale && batch.entries.length <= 24));

		for (const source of sourceProducts) {
			const localized = payload.data.find((product) => product.id === source.id);
			const reviewed = service.translationCatalog.reviewedPreviewTranslations[locale][source.slug];
			assert.ok(localized, `missing preview product ${source.slug}`);
			assert.ok(reviewed, `missing reviewed ${locale} translation for ${source.slug}`);

			for (const field of service.translationCatalog.previewTranslatableFields) {
				const sourceValue = source[field];
				if (typeof sourceValue !== "string" || !sourceValue) continue;
				assert.ok(
					typeof reviewed[field] === "string" && reviewed[field].length > 0,
					`${locale} is missing ${source.slug}.${field}`,
				);
				const key = `preview.product.${source.slug}.${field}`;
				assert.equal(
					localized[field],
					translationCache.get(`${locale}:${key}`) ?? reviewed[field],
					`${locale} did not localize ${source.slug}.${field}`,
				);
			}

			for (const [index, image] of (source.galleryImages ?? []).entries()) {
				assert.ok(reviewed.imageAlt, `${locale} is missing ${source.slug}.galleryImages[${index}].alt`);
				const galleryKey = `preview.product.${source.slug}.gallery.${index}.alt`;
				assert.equal(
					localized.galleryImages[index].alt,
					translationCache.get(`${locale}:${galleryKey}`) ?? reviewed.imageAlt,
					`${locale} did not localize ${source.slug}.galleryImages[${index}].alt`,
				);
				assert.equal(typeof image.alt, "string");
			}

			for (const field of ["id", "sku", "slug", "supplierName", "makerName", "brandName", "priceAmount", "currency", "availability", "availabilityStatus"]) {
				assert.deepEqual(localized[field], source[field], `${field} changed for ${source.slug}`);
			}
		}

		const cachedProduct = payload.data.find((product) => product.slug === "haneul-bunny");
		assert.equal(cachedProduct.name, cachedName);
		assert.equal(cachedProduct.description, service.translationCatalog.reviewedPreviewTranslations[locale]["haneul-bunny"].description);
		assert.ok(providerCalls > 0, "the mocked provider should handle cache misses");
	}
});

test("English preview data stays unchanged and configured backend products bypass preview translations", async () => {
	const englishService = loadProductsRoute();
	const englishResponse = await englishService.GET(new Request("http://localhost/api/products?locale=en"));
	const english = await englishResponse.json();
	assert.equal(JSON.stringify(english.data), JSON.stringify(englishService.productService.storefrontPreviewProducts));
	assert.equal(englishService.translationRequests.length, 0);

	const backendProduct = {
		...englishService.productService.storefrontPreviewProducts[0],
		name: "DB localized product",
	};
	const context = {
		exports: {},
		require: (id) => {
			if (id === "server-only") return {};
			if (id === "next/headers") return { cookies: async () => ({ get: () => ({ value: "en" }) }) };
			if (id === "@/services/product.service") {
				return {
					getProducts: async (_query, locale) => {
						assert.equal(locale, "ko");
						return [backendProduct];
					},
					getProductById: async () => backendProduct,
				};
			}
			if (id === "@/services/ponyo-api.client") return { PONYO_API_BASE_URL: "https://api.example.test" };
			if (id === "@/services/preview-product-translations") {
				return englishService.translationCatalog;
			}
			if (id === "@/services/app-translations.server") {
				return { requestAppTranslations: async () => assert.fail("backend products use ProductTranslation") };
			}
			throw new Error(`Unexpected dependency: ${id}`);
		},
	};
	const service = compile("../src/services/localized-products.server.ts", context);
	const products = await service.getLocalizedProducts("", "ko");
	assert.equal(products[0].name, "DB localized product");
});
