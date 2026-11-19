import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(path) {
	const context = { exports: {}, Intl };
	vm.runInNewContext(
		ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2022,
			},
		}).outputText,
		context,
	);
	return context.exports;
}
const { regionName, currencyName } = load("../src/lib/localization-options.ts");
const { uniqueProducts } = load("../src/lib/featured-products.ts");
const { formatCountryBudget, getCountryBudgetProfile } = load(
	"../src/lib/budget-by-country.ts",
);

test("Japanese and Korean country/currency labels use native scripts", () => {
	assert.equal(regionName("JP", "ja", "Japan"), "日本");
	assert.equal(regionName("JP", "ko", "Japan"), "일본");
	assert.match(regionName("KR", "ko", "South Korea"), /대한민국|한국/);
	assert.match(currencyName("JPY", "ja", "Japanese Yen"), /円/);
	for (const locale of ["en", "es", "id", "ja", "ko", "zh-CN"]) {
		assert.ok(regionName("JP", locale, "Japan"));
		assert.ok(currencyName("JPY", locale, "Japanese Yen"));
	}
});

test("shop-by-budget uses round country prices and JPY filter thresholds", () => {
	const korea = getCountryBudgetProfile("KR");
	assert.deepEqual(
		[korea.underMax, korea.middleMax, korea.overMin],
		[150000, 250000, 500000],
	);
	assert.deepEqual(
		[
			korea.filterJPY.underMax,
			korea.filterJPY.middleMax,
			korea.filterJPY.overMin,
		],
		[18000, 30000, 60000],
	);
	assert.equal(formatCountryBudget("KR", korea.underMax), "₩150,000");
	assert.equal(
		formatCountryBudget("JP", getCountryBudgetProfile("JP").underMax),
		"￥20,000",
	);
	assert.equal(getCountryBudgetProfile("unknown").currency, "JPY");
});

test("rare preview keeps at most three distinct product identities and slugs", () => {
	const products = [
		{ id: "a", slug: "bunny" },
		{ id: "a", slug: "bunny-xl" },
		{ id: "b", slug: "bunny" },
		{ id: "c", slug: "bear" },
		{ id: "d", slug: "cat" },
		{ id: "e", slug: "fox" },
	];
	const preview = uniqueProducts(products).slice(0, 3);
	assert.deepEqual(
		Array.from(preview, (p) => p.id),
		["a", "c", "d"],
	);
	assert.equal(products.length, 6);
});

test("delivery trigger has no country flag and reviewed translations outrank automation", () => {
	const banner = readFileSync(
		new URL(
			"../src/components/layout/delivery-region-banner.tsx",
			import.meta.url,
		),
		"utf8",
	);
	assert.ok(
		!banner
			.split("delivery-region-trigger")[1]
			.split("</button>")[0]
			.includes("selectedCountry.flag"),
	);
	const provider = readFileSync(
		new URL(
			"../src/components/layout/localization-provider.tsx",
			import.meta.url,
		),
		"utf8",
	);
	assert.ok(provider.includes("const intlTranslate = useTranslations()"));
	assert.ok(provider.includes("if (intlTranslate.has(key)) return intlTranslate(key, values)"));
});
