import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/locales/app-translations.ts", import.meta.url), "utf8");
const context = { exports: {} };
vm.runInNewContext(
	ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText,
	context,
);
const translations = context.exports.appTranslations;

const shopKeys = [
	"shop.metadata.title", "shop.metadata.description", "shop.heading.all", "shop.heading.search",
	"shop.description.default", "shop.description.premium", "shop.category.all", "shop.category.bears",
	"shop.category.bunnies", "shop.category.cats", "shop.category.characters", "shop.category.new_arrivals",
	"shop.category.pandas", "shop.category.penguins", "shop.category.premium", "shop.category.puppies",
	"shop.category.trending", "shop.category.xl", "shop.category.rare", "shop.size.small",
	"shop.size.medium", "shop.size.large", "shop.size.xl", "shop.badge.rare", "shop.badge.premium",
	"shop.badge.new", "shop.filter.categories_aria",
	"shop.filter.product_categories_aria", "shop.filter.products_aria", "shop.filter.active_aria",
	"shop.filter.filters", "shop.filter.refine", "shop.filter.category", "shop.filter.size",
	"shop.filter.all", "shop.filter.any_size", "shop.filter.price", "shop.filter.price_range",
	"shop.filter.from", "shop.filter.to", "shop.filter.to_connector", "shop.filter.no_limit",
	"shop.filter.availability", "shop.filter.in_stock", "shop.filter.in_stock_only",
	"shop.filter.apply_price", "shop.filter.show_results", "shop.filter.clear", "shop.filter.clear_all",
	"shop.filter.remove", "shop.filter.size_value", "shop.filter.price_from", "shop.filter.price_to",
	"shop.sort.label", "shop.sort.current", "shop.sort.options_aria", "shop.sort.featured",
	"shop.sort.relevance", "shop.sort.best_selling", "shop.sort.title_ascending",
	"shop.sort.title_descending", "shop.sort.price_ascending", "shop.sort.price_descending",
	"shop.sort.created_ascending", "shop.sort.created_descending", "shop.count.plush",
	"shop.count.products", "shop.count.category", "shop.empty.title", "shop.empty.description",
	"shop.empty.cta",
];
const homeKeys = [
	"home.shelf.new_eyebrow", "home.shelf.new_title", "home.shelf.new_sub",
	"home.shelf.trending_eyebrow", "home.shelf.trending_title", "home.shelf.trending_sub",
	"home.shelf.coming_soon_eyebrow", "home.shelf.coming_soon_title", "home.shelf.coming_soon_sub",
	"home.shelf.coming_soon_link", "home.v2.new_title", "home.v2.new_sub", "home.v2.see_all",
	"home.more_plush.title", "home.more_plush.sub", "home.domina_shelf.eyebrow",
	"home.domina_shelf.title", "home.most_loved.eyebrow", "home.most_loved.title",
	"home.most_loved.sub", "home.aisles.see_more_simple", "home.see_all", "home.see_all_short",
	"home.category_rail.aria_label", "home.slides.choose_collection", "home.size.marquee_label",
	"home.size.marquee_big_hugs", "home.size.marquee_up_to", "home.image_alt.lifestyle",
	"home.size.image_alt", "home.image_alt.domina", "home.image_alt.carousel.xl",
	"home.image_alt.carousel.premium", "home.image_alt.carousel.new",
	"home.image_alt.carousel.collectibles",
];

test("shop and homepage copy has reviewed English, Japanese, and Korean entries", () => {
	for (const locale of ["en", "ja", "ko"]) {
		for (const key of [...shopKeys, ...homeKeys]) {
			assert.equal(typeof translations[locale]?.[key], "string", `${locale} is missing ${key}`);
			assert.ok(translations[locale][key].trim(), `${locale} has blank ${key}`);
		}
	}
	assert.notEqual(translations.ja["shop.metadata.title"], translations.en["shop.metadata.title"]);
	assert.notEqual(translations.ko["shop.metadata.title"], translations.en["shop.metadata.title"]);
	assert.match(translations.ja["shop.heading.search"], /\{query\}/);
	assert.match(translations.ko["shop.filter.remove"], /\{label\}/);
	assert.match(translations.ja["home.size.image_alt"], /\{size\}/);
});

test("shop metadata, labels, filters, counts, and empty states are wired to translations", () => {
	const shopPage = readFileSync(new URL("../src/app/shop/page.tsx", import.meta.url), "utf8");
	const filterPanel = readFileSync(new URL("../src/components/product/catalog-filter-panel.tsx", import.meta.url), "utf8");
	const sortSelect = readFileSync(new URL("../src/components/product/sort-select.tsx", import.meta.url), "utf8");
	assert.match(shopPage, /export async function generateMetadata/);
	for (const key of ["shop.metadata.title", "shop.heading.search", "shop.description.default", "shop.count.products", "shop.empty.title", "shop.badge.rare", "shop.badge.premium", "shop.badge.new"]) {
		assert.ok(shopPage.includes(key), `shop page does not use ${key}`);
	}
	for (const key of ["shop.filter.filters", "shop.filter.category", "shop.filter.price_range", "shop.filter.show_results", "shop.size.small", "shop.size.medium", "shop.size.large", "shop.size.xl"]) {
		assert.ok(filterPanel.includes(key), `filter panel does not use ${key}`);
	}
	for (const key of ["shop.sort.label", "shop.sort.current", "shop.sort.options_aria", "shop.sort.price_ascending"]) {
		assert.ok(sortSelect.includes(key), `sort menu does not use ${key}`);
	}
});

test("homepage shelf, category rail, marquee, and descriptive image alt text use localized keys", () => {
	const homePage = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
	const homeCarousel = readFileSync(new URL("../src/components/home/home-carousel.tsx", import.meta.url), "utf8");
	const shelf = readFileSync(new URL("../src/components/product/product-shelf.tsx", import.meta.url), "utf8");
	for (const key of ["home.category_rail.aria_label", "home.size.marquee_label", "home.size.marquee_big_hugs", "home.image_alt.lifestyle", "home.image_alt.domina", "home.size.image_alt"]) {
		assert.ok(homePage.includes(key), `homepage does not use ${key}`);
	}
	assert.match(homeCarousel, /t\(slide\.imageAltKey, slide\.imageAlt\)/);
	assert.match(homeCarousel, /home\.slides\.choose_collection/);
	assert.match(shelf, /home\.most_loved\.eyebrow/);
});
