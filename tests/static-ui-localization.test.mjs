import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const source = read("src/locales/static-ui-translations.ts");
const context = { exports: {} };
vm.runInNewContext(
	ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
		},
	}).outputText,
	context,
);
const translations = context.exports.staticUiTranslations;
const locales = ["en", "ja", "ko"];
const placeholders = (value) => [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
	.map(([, name]) => name)
	.sort();

test("static storefront additions have complete reviewed English, Japanese, and Korean messages", () => {
	assert.ok(Object.keys(translations.en).length > 150);
	for (const locale of locales) {
		assert.deepEqual(
			Object.keys(translations[locale]).sort(),
			Object.keys(translations.en).sort(),
			`${locale} key coverage`,
		);
		for (const [key, value] of Object.entries(translations[locale])) {
			assert.ok(value.trim(), `${locale}:${key} is blank`);
			assert.equal(value, value.trim(), `${locale}:${key} has surrounding whitespace`);
			assert.deepEqual(placeholders(value), placeholders(translations.en[key]), `${locale}:${key} placeholders`);
		}
	}
	assert.notEqual(translations.ja["static.collections.hero.title_accent"], translations.en["static.collections.hero.title_accent"]);
	assert.notEqual(translations.ko["static.collections.hero.title_accent"], translations.en["static.collections.hero.title_accent"]);
});

test("every new static-ui key used in the storefront is available in all supported languages", () => {
	const paths = [
		"src/app/admin-portal/page.tsx",
		"src/app/collections/page.tsx",
		"src/app/error.tsx",
		"src/app/for-makers/page.tsx",
		"src/app/products/[id]/loading.tsx",
		"src/app/size-guide/page.tsx",
		"src/app/account/verify-email/page.tsx",
		"src/components/account/account-address-book.tsx",
		"src/components/account/account-auth-form.tsx",
		"src/components/account/account-dashboard.tsx",
		"src/components/account/account-drawer.tsx",
		"src/components/home/animal-tabs.tsx",
		"src/components/layout/local-store-forms.tsx",
		"src/components/layout/partner-inquiry-form.tsx",
		"src/components/layout/site-footer.tsx",
		"src/components/layout/site-header.tsx",
		"src/components/layout/store-search.tsx",
		"src/components/product/product-card-action.tsx",
		"src/components/product/product-community.tsx",
		"src/components/product/product-gallery.tsx",
		"src/components/product/product-grid.tsx",
		"src/components/product/product-purchase-panel.tsx",
		"src/components/ui/category-scroll-button.tsx",
	];
	const usedKeys = new Set();
	for (const file of paths) {
		for (const [, key] of read(file).matchAll(/["']((?:static|size\.guide|admin\.reservations)\.[\w.]+)["']/g)) {
			usedKeys.add(key);
		}
	}
	for (const key of usedKeys) {
		for (const locale of locales) {
			assert.ok(translations[locale][key], `${locale} is missing ${key}`);
		}
	}
	const messageLoader = read("src/i18n/messages.ts");
	assert.match(messageLoader, /import \{ staticUiTranslations \}/);
	assert.match(messageLoader, /staticUiTranslations,/);
});
