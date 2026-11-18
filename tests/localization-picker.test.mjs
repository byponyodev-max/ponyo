import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compile = (path, imports = {}) => {
	const source = readFileSync(new URL(path, import.meta.url), "utf8");
	const context = {
		exports: {},
		require: (name) => {
			if (imports[name]) return imports[name];
			if (name === "react/jsx-runtime") {
				const jsx = (type, props) => ({ type, props });
				return { jsx, jsxs: jsx };
			}
			throw new Error(`Unexpected import: ${name}`);
		},
	};
	vm.runInNewContext(
		ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2022,
				jsx: ts.JsxEmit.ReactJSX,
			},
		}).outputText,
		context,
	);
	return context.exports;
};

const options = compile("../src/lib/localization-options.ts");
const nodes = (node) => {
	if (!node || typeof node !== "object") return [];
	if (Array.isArray(node)) return node.flatMap(nodes);
	return [
		...(node.type ? [node] : []),
		...(typeof node.type === "function" ? nodes(node.type(node.props)) : []),
		...nodes(node.props?.children),
	];
};
const text = (node) => {
	if (node == null || typeof node === "boolean") return "";
	if (Array.isArray(node)) return node.map(text).join("");
	if (typeof node !== "object") return String(node);
	return text(node.props?.children);
};

function renderPicker(language, currency, rateStatus = "ready", handlers = {}) {
	const state = [false, "language", ""];
	let stateIndex = 0;
	let retries = 0;
	const picker = compile("../src/components/layout/localization-picker.tsx", {
		react: {
			useEffect() {},
			useMemo: (factory) => factory(),
			useRef: (current) => ({ current }),
			useState(initial) {
				const index = stateIndex++;
				if (state[index] === undefined) state[index] = initial;
				return [
					state[index],
					(value) => {
						state[index] = typeof value === "function" ? value(state[index]) : value;
					},
				];
			},
		},
		"@/components/layout/localization-provider": {
			useLocalization: () => ({
				language,
				currency,
				languages: options.languages,
				currencies: options.currencies,
				rates: rateStatus === "ready" ? { JPY: 1, KRW: 0.1 } : { JPY: 1 },
				rateStatus,
				refreshRates: async () => { retries += 1; },
				setLanguage: handlers.setLanguage ?? (async () => {}),
				setCurrency: handlers.setCurrency ?? (async () => {}),
				t: (_key, fallback) => fallback,
			}),
		},
		"@/lib/localization-options": {
			currencyName: (_code, _language, fallback) => fallback,
			regionName: (_code, _language, fallback) => fallback,
		},
	});
	return {
		state,
		get retries() { return retries; },
		render() {
			stateIndex = 0;
			return picker.LocalizationPicker({});
		},
	};
}

test("picker uses compact country codes for languages and currency symbols instead of flags", () => {
	const picker = renderPicker("ko", "KRW");
	const trigger = nodes(picker.render()).find(
		(node) => node.type === "button" && node.props.className === "store-localization-trigger",
	);
	assert.match(text(trigger), /KR/);
	assert.match(text(trigger), /₩ KRW/);
	assert.doesNotMatch(text(trigger), /\bKO\b/);

	picker.state[0] = true;
	let optionsList = nodes(picker.render()).filter(
		(node) => node.type === "button" && node.props.role === "option",
	);
	assert.deepEqual(
		optionsList.map((option) => text(option).slice(0, 2)),
		["JP", "KR", "EN"],
	);
	assert.ok(optionsList.every((option) => !/JA|KO/.test(text(option))));

	picker.state[1] = "currency";
	optionsList = nodes(picker.render()).filter(
		(node) => node.type === "button" && node.props.role === "option",
	);
	const icons = optionsList.map((option) =>
		nodes(option).find((node) => node.props?.className?.includes("localization-currency-code")),
	);
	assert.deepEqual(icons.map(text), ["¥", "₩"]);
	assert.doesNotMatch(optionsList.map(text).join(" "), /🇯🇵|🇰🇷/);

	const css = readFileSync(new URL("../src/app/theme-parity-polish.css", import.meta.url), "utf8");
	assert.match(css, /\.localization-language-code\s*\{[^}]*font-size:\s*9px/s);
});

test("missing exchange rates can be retried without disabling currency selection", () => {
	const picker = renderPicker("en", "KRW", "error");
	picker.state[0] = true;
	let tree = picker.render();
	const currencyTab = nodes(tree).find(
		(node) => node.props?.role === "tab" && node.props["aria-selected"] === false &&
			text(node) === "Currency",
	);
	currencyTab.props.onClick();
	assert.equal(picker.retries, 1);
	tree = picker.render();
	const retry = nodes(tree).find(
		(node) => node.type === "button" && node.props.className === "localization-rates-retry",
	);
	assert.ok(retry);
	retry.props.onClick();
	assert.equal(picker.retries, 2);
	const currencyOptions = nodes(tree).filter(
		(node) => node.type === "button" && node.props.role === "option",
	);
	assert.equal(currencyOptions.length, 2);
});

test("language and currency selections close the picker before preference saves finish", () => {
	let finishLanguageSave;
	let finishCurrencySave;
	const picker = renderPicker("ja", "JPY", "ready", {
		setLanguage: () => new Promise((resolve) => { finishLanguageSave = resolve; }),
		setCurrency: () => new Promise((resolve) => { finishCurrencySave = resolve; }),
	});

	picker.state[0] = true;
	let optionsList = nodes(picker.render()).filter(
		(node) => node.type === "button" && node.props.role === "option",
	);
	optionsList.find((option) => text(option).includes("한국어")).props.onClick();
	assert.equal(picker.state[0], false);
	finishLanguageSave();

	picker.state[0] = true;
	picker.state[1] = "currency";
	optionsList = nodes(picker.render()).filter(
		(node) => node.type === "button" && node.props.role === "option",
	);
	optionsList.find((option) => text(option).includes("South Korean Won")).props.onClick();
	assert.equal(picker.state[0], false);
	finishCurrencySave();
});

test("currency conversion recovers after temporary rate API failures", async () => {
	const states = [];
	const refs = [];
	const effects = [];
	let cursor = 0;
	let refCursor = 0;
	let rateRequests = 0;
	let routerRefreshes = 0;
	const translationModules = {
		"@/locales/app-translations": "appTranslations",
		"@/locales/storefront-translations": "storefrontTranslations",
		"@/locales/checkout-translations": "checkoutTranslations",
		"@/locales/contact-translations": "contactTranslations",
		"@/locales/wishlist-translations": "wishlistTranslations",
		"@/locales/auth-translations": "authTranslations",
		"@/locales/order-translations": "orderTranslations",
		"@/locales/account-translations": "accountTranslations",
	};
	const context = {
		exports: {},
		document: { documentElement: { lang: "" } },
		window: { setTimeout: (callback) => { callback(); return 0; } },
		fetch: async (url) => {
			if (String(url).includes("/api/localization/rates")) {
				rateRequests += 1;
				if (rateRequests < 3) return { ok: false };
				return {
					ok: true,
					json: async () => ({ data: { base: "JPY", rates: { KRW: 0.1 } } }),
				};
			}
			return { ok: false };
		},
		require(name) {
			if (name === "react") {
				return {
					createContext: () => ({ Provider: "Provider" }),
					useCallback: (callback) => callback,
					useContext: () => null,
					useEffect: (effect) => effects.push(effect),
					useMemo: (factory) => factory(),
					useRef(initial) {
						const index = refCursor++;
						if (!(index in refs)) refs[index] = { current: initial };
						return refs[index];
					},
					useState(initial) {
						const index = cursor++;
						if (!(index in states)) states[index] = initial;
						return [
							states[index],
							(value) => {
								states[index] = typeof value === "function" ? value(states[index]) : value;
							},
						];
					},
				};
			}
			if (name === "next/navigation") return { useRouter: () => ({ refresh() { routerRefreshes += 1; } }) };
			if (name === "next-intl") return { useTranslations: () => ({ has: () => false, raw: () => undefined }) };
			if (name === "@/lib/localization-options") return options;
			if (name === "@/services/ponyo-api.client") return { PONYO_API_BASE_URL: "" };
			if (name === "react/jsx-runtime") {
				const jsx = (type, props) => ({ type, props });
				return { jsx, jsxs: jsx };
			}
			if (translationModules[name]) return { [translationModules[name]]: {} };
			throw new Error(`Unexpected localization provider import: ${name}`);
		},
	};
	const source = readFileSync(
		new URL("../src/components/layout/localization-provider.tsx", import.meta.url),
		"utf8",
	);
	vm.runInNewContext(
		ts.transpileModule(source, {
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2022,
				jsx: ts.JsxEmit.ReactJSX,
			},
		}).outputText,
		context,
	);
	const render = () => {
		cursor = 0;
		refCursor = 0;
		return context.exports.LocalizationProvider({
			children: null,
			initialLanguage: "en",
			initialCurrency: "JPY",
			initialCountry: "KR",
		}).props.value;
	};
	const preferences = render();
	await preferences.setCurrency("KRW");
	assert.equal(routerRefreshes, 0);
	await preferences.refreshRates();
	assert.equal(rateRequests, 3);
	const updated = render();
	assert.equal(updated.convertMajorAmount(1000, "JPY"), 100);
	assert.match(updated.formatPrice(1000, "JPY"), /₩100/);
});

test("delivery country options render flag artwork in the leading badge", () => {
	const state = [true, ""];
	let stateIndex = 0;
	const banner = compile("../src/components/layout/delivery-region-banner.tsx", {
		react: {
			useEffect() {},
			useMemo: (factory) => factory(),
			useState(initial) {
				const index = stateIndex++;
				if (state[index] === undefined) state[index] = initial;
				return [state[index], (value) => { state[index] = value; }];
			},
		},
		"next/link": { default: "a" },
		"@/components/layout/localization-provider": {
			useLocalization: () => ({
				language: "en",
				country: "JP",
				deliveryCountries: options.deliveryCountries,
				deliveryNoticeDismissed: true,
				setDeliveryCountry() {},
				dismissDeliveryNotice() {},
				t: (_key, fallback) => fallback,
			}),
		},
		"@/lib/localization-options": {
			regionName: (_code, _language, fallback) => fallback,
		},
	});
	const tree = banner.DeliveryRegionBanner();
	const countryOptions = nodes(tree).filter(
		(node) => node.type === "button" && node.props.role === "option",
	);
	assert.equal(countryOptions.length, 2);
	for (const option of countryOptions) {
		const badge = nodes(option).find(
			(node) => node.props?.className === "delivery-country-flag",
		);
		assert.ok(nodes(badge).some((node) => node.type === "svg"));
	}
});