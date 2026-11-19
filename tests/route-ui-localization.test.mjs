import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function loadTranslations(file, exportName) {
	const source = read(file);
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
	return context.exports[exportName];
}

const pages = loadTranslations("src/locales/pages-ui-translations.ts", "pagesUiTranslations");
const admin = loadTranslations("src/locales/admin-ui-translations.ts", "adminUiTranslations");
const orders = loadTranslations("src/locales/order-translations.ts", "orderTranslations");
const auth = loadTranslations("src/locales/auth-translations.ts", "authTranslations");
const locales = ["en", "ja", "ko"];
const placeholders = (value) => [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
	.map(([, name]) => name)
	.sort();

test("public route and admin interface messages have matching EN/JA/KO coverage", () => {
	for (const [name, translations] of [["pages", pages], ["admin", admin]]) {
		assert.ok(Object.keys(translations.en).length > 20, `${name} messages are loaded`);
		for (const locale of locales) {
			assert.deepEqual(Object.keys(translations[locale]).sort(), Object.keys(translations.en).sort(), `${name}:${locale} keys`);
			for (const [key, value] of Object.entries(translations[locale])) {
				assert.ok(value.trim(), `${locale}:${key} is not blank`);
				assert.deepEqual(placeholders(value), placeholders(translations.en[key]), `${locale}:${key} placeholders`);
			}
		}
	}
});

test("page, product, cart, and admin copy is wired to reviewed message keys", () => {
	const pagesSource = read("src/app/pages/[slug]/page.tsx");
	const productSource = read("src/app/products/[id]/page.tsx");
	const cartSource = read("src/components/layout/cart-page-client.tsx");
	const adminSource = read("src/app/admin-portal/page.tsx");
	const messageLoader = read("src/i18n/messages.ts");

	for (const [, suffix] of pagesSource.matchAll(/<PageCopy\b[^>]*\bid="([\w.]+)"/g)) {
		assert.ok(pages.en[`pages.${suffix}`], `Missing route-page message pages.${suffix}`);
	}
	for (const suffix of ["faq.ordering_title", "faq.shipping_title", "faq.sizes_title", "faq.care_title", "faq.help_title"]) {
		assert.ok(pages.en[`pages.${suffix}`], `Missing dynamic FAQ topic message pages.${suffix}`);
	}
	for (const [, key] of productSource.matchAll(/translationKey="(pages\.product\.[\w.]+)"/g)) {
		assert.ok(pages.en[key], `Missing product-detail message ${key}`);
	}
	for (const [, key] of cartSource.matchAll(/t\("(cart\.[\w.]+)"/g)) {
		assert.ok(pages.en[key], `Missing cart message ${key}`);
	}
	for (const [, key] of adminSource.matchAll(/ui\("([\w.]+)"/g)) {
		assert.ok(admin.en[`admin.ui.${key}`], `Missing admin message admin.ui.${key}`);
	}
	assert.match(messageLoader, /pagesUiTranslations/);
	assert.match(messageLoader, /adminUiTranslations/);
});

test("gated cart, order, and account routes retain localized metadata and existing form messages", () => {
	const routeFiles = [
		["src/app/cart/page.tsx", "routes.cart.title"],
		["src/app/account/page.tsx", "routes.account.profile"],
		["src/app/account/login/page.tsx", "routes.account.login"],
		["src/app/account/register/page.tsx", "routes.account.register"],
		["src/app/account/addresses/page.tsx", "routes.account.addresses"],
		["src/app/account/forgot-password/page.tsx", "routes.account.forgot_password"],
		["src/app/account/reset-password/page.tsx", "routes.account.reset_password"],
	];
	for (const [file, key] of routeFiles) {
		assert.ok(read(file).includes(`t("${key}")`), `${file} uses ${key}`);
		assert.ok(pages.en[key], `Missing metadata message ${key}`);
	}
	assert.match(read("src/app/orders/page.tsx"), /t\("orders\.title"\)/);
	for (const locale of locales) {
		assert.ok(orders[locale]["orders.title"], `${locale} order title`);
		assert.ok(auth[locale]["account.auth.login_subtitle"], `${locale} sign-in copy`);
		assert.ok(auth[locale]["account.auth.new_password_title"], `${locale} reset-password copy`);
	}
	assert.match(read("src/components/layout/checkout-page-client.tsx"), /t\("checkout\.heading"/);
});
