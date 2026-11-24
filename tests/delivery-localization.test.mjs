import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
	new URL("../src/lib/localization-options.ts", import.meta.url),
	"utf8",
);
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
const {
	currencies,
	deliveryCountries,
	getInterestCountryOptions,
	getDeliveryLocalization,
	isDeliveryCountryCode,
	languages,
	resolveDeliveryCountry,
} = context.exports;

test("delivery is limited to Japan and South Korea with matching defaults", () => {
	assert.deepEqual(
		Array.from(deliveryCountries, ({ code }) => code),
		["JP", "KR"],
	);
	assert.deepEqual(
		[getDeliveryLocalization("JP").language, getDeliveryLocalization("JP").currency],
		["ja", "JPY"],
	);
	assert.deepEqual(
		[getDeliveryLocalization("KR").language, getDeliveryLocalization("KR").currency],
		["ko", "KRW"],
	);
	assert.deepEqual(
		Array.from(languages, ({ code, badge }) => `${code}:${badge}`),
		["ja:JP", "ko:KR", "en:EN"],
	);
	assert.ok(currencies.some(({ code }) => code === "JPY"));
	assert.ok(currencies.some(({ code }) => code === "KRW"));
});

test("saved delivery choice wins; supported detected region is used for first visits", () => {
	assert.equal(resolveDeliveryCountry("KR", ["JP"]), "KR");
	assert.equal(resolveDeliveryCountry(undefined, ["US", " kr "]), "KR");
	assert.equal(resolveDeliveryCountry(undefined, ["US", "T1"]), "JP");
	assert.equal(isDeliveryCountryCode("US"), false);
});

test("interest country options include worldwide regions and prioritize Japan and Korea", () => {
	const options = getInterestCountryOptions("en");
	assert.equal(options.length, 249);
	assert.deepEqual(
		Array.from(options.slice(0, 2), ({ code }) => code),
		["JP", "KR"],
	);
	const remainingLabels = Array.from(options.slice(2), ({ label }) => label);
	assert.deepEqual(
		remainingLabels,
		[...remainingLabels].sort((a, b) => a.localeCompare(b, "en")),
	);

	const excludingShippedCountries = getInterestCountryOptions("en", ["JP", "US"]);
	assert.equal(excludingShippedCountries.some(({ code }) => code === "JP" || code === "US"), false);
	assert.equal(excludingShippedCountries[0].code, "KR");
});

test("changing delivery country applies defaults while manual language and currency changes remain available", async () => {
	const states = [];
	const savedPreferences = [];
	let cursor = 0;
	let refreshCount = 0;
	const providerContext = {
		exports: {},
		fetch: async (_url, options) => {
			savedPreferences.push(JSON.parse(options.body));
			return { ok: true };
		},
		require(id) {
			if (id === "react") {
				return {
					createContext: () => ({ Provider: "Provider" }),
					useCallback: (callback) => callback,
					useContext: () => null,
					useEffect() {},
					useMemo: (factory) => factory(),
					useRef: (initial) => ({ current: initial }),
					useState(initial) {
						const index = cursor++;
						if (!(index in states)) states[index] = initial;
						return [
							states[index],
							(next) => {
								states[index] = typeof next === "function" ? next(states[index]) : next;
							},
						];
					},
				};
			}
			if (id === "next/navigation") return { useRouter: () => ({ refresh: () => refreshCount++ }) };
			if (id === "next-intl") {
				const translate = () => "";
				translate.has = () => false;
				return { useTranslations: () => translate };
			}
			if (id === "@/lib/localization-options") return context.exports;
			if (id === "@/services/ponyo-api.client") return { ponyoApi: {}, PONYO_API_BASE_URL: "" };
			if (id === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
			const translationExports = {
				"@/locales/app-translations": "appTranslations",
				"@/locales/storefront-translations": "storefrontTranslations",
				"@/locales/checkout-translations": "checkoutTranslations",
				"@/locales/contact-translations": "contactTranslations",
				"@/locales/wishlist-translations": "wishlistTranslations",
				"@/locales/auth-translations": "authTranslations",
				"@/locales/order-translations": "orderTranslations",
				"@/locales/account-translations": "accountTranslations",
			};
			if (translationExports[id]) return { [translationExports[id]]: {} };
			throw new Error(`Unexpected localization provider import: ${id}`);
		},
	};
	const providerSource = readFileSync(
		new URL("../src/components/layout/localization-provider.tsx", import.meta.url),
		"utf8",
	);
	vm.runInNewContext(
		ts.transpileModule(providerSource, {
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2022,
				jsx: ts.JsxEmit.ReactJSX,
			},
		}).outputText,
		providerContext,
	);
	const render = () => {
		cursor = 0;
		return providerContext.exports.LocalizationProvider({
			children: null,
			initialLanguage: "en",
			initialCurrency: "JPY",
			initialCountry: "JP",
		}).props.value;
	};

	let preferences = render();
	await preferences.setDeliveryCountry("KR");
	preferences = render();
	assert.deepEqual(
		[preferences.country, preferences.language, preferences.currency],
		["KR", "ko", "KRW"],
	);
	assert.deepEqual(savedPreferences[0], { country: "KR", language: "ko", currency: "KRW" });
	assert.equal(refreshCount, 1);

	await preferences.setLanguage("en");
	await preferences.setCurrency("JPY");
	preferences = render();
	assert.deepEqual(
		[preferences.country, preferences.language, preferences.currency],
		["KR", "en", "JPY"],
	);
});

test("location modal keeps the sign-in action in markup but hidden during phase zero", () => {
	const source = readFileSync(
		new URL("../src/components/layout/delivery-region-banner.tsx", import.meta.url),
		"utf8",
	);
	assert.match(source, /<Link className="delivery-location-signin" href="\/account" hidden>/);
	assert.match(source, /delivery\.sign_in_addresses/);
});
