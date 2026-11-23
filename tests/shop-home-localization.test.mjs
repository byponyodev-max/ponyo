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
	"shop.category.trending", "shop.category.xl", "shop.category.rare", "shop.category.plush_toys",
	"shop.category.collectible_plush", "shop.category.character_plush", "shop.category.oversized",
	"shop.category.giant_plush", "shop.category.oversized_soft_objects", "shop.category.cushions",
	"shop.category.designer_cushions", "shop.category.character_pillows", "shop.category.soft_furniture",
	"shop.category.chairs", "shop.category.beds", "shop.category.seating", "shop.category.wall_decor",
	"shop.size.small",
	"shop.size.medium", "shop.size.large", "shop.size.xl", "shop.badge.rare", "shop.badge.premium",
	"shop.badge.new", "shop.filter.categories_aria",
	"shop.filter.product_categories_aria", "shop.filter.products_aria", "shop.filter.active_aria",
	"shop.filter.more_ways",
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
	"home.most_loved.sub", "home.aisles.see_more_simple", "home.aisles.view_all",
	"home.aisles.empty_title", "home.aisles.empty", "home.aisles.wall_decor_sub",
	"home.see_all", "home.see_all_short",
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
	assert.ok(translations.ja["home.header.domina"]);
	assert.ok(translations.ko["home.header.domina"]);
	assert.match(translations.ja["shop.heading.search"], /\{query\}/);
	assert.match(translations.ko["shop.filter.remove"], /\{label\}/);
	assert.match(translations.ja["home.size.image_alt"], /\{size\}/);
});

test("shop metadata, labels, filters, counts, and empty states are wired to translations", () => {
	const shopPage = readFileSync(new URL("../src/app/shop/page.tsx", import.meta.url), "utf8");
	const filterPanel = readFileSync(new URL("../src/components/product/catalog-filter-panel.tsx", import.meta.url), "utf8");
	const sortSelect = readFileSync(new URL("../src/components/product/sort-select.tsx", import.meta.url), "utf8");
	const collectionStyles = readFileSync(new URL("../src/app/collection-theme.css", import.meta.url), "utf8");
	assert.match(shopPage, /export async function generateMetadata/);
	for (const key of ["shop.metadata.title", "shop.heading.search", "shop.description.default", "shop.count.products", "shop.empty.title"]) {
		assert.ok(shopPage.includes(key), `shop page does not use ${key}`);
	}
	assert.doesNotMatch(shopPage, /shop\.badge\.(?:rare|premium|new)/);
	for (const key of ["shop.filter.filters", "shop.filter.category", "shop.filter.price_range", "shop.filter.show_results", "shop.size.small", "shop.size.medium", "shop.size.large", "shop.size.xl"]) {
		assert.ok(filterPanel.includes(key), `filter panel does not use ${key}`);
	}
	for (const key of ["shop.sort.label", "shop.sort.current", "shop.sort.options_aria", "shop.sort.price_ascending"]) {
		assert.ok(sortSelect.includes(key), `sort menu does not use ${key}`);
	}
	assert.match(shopPage, /<details className="collection-sidebar-details" open>/);
	assert.match(shopPage, /<summary>\{t\("shop\.filter\.category"\)\}<\/summary>/);
	assert.match(collectionStyles, /@media \(min-width: 1024px\)[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
	assert.match(collectionStyles, /\.collection-layout:has\(> \.collection-sidebar \.collection-sidebar-details:not\(\[open\]\)\)/);
});

test("homepage shelf, category rail, marquee, and descriptive image alt text use localized keys", () => {
	const homePage = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
	const homeStyles = readFileSync(new URL("../src/app/theme-parity.css", import.meta.url), "utf8");
	const homePolishStyles = readFileSync(new URL("../src/app/theme-parity-polish.css", import.meta.url), "utf8");
	const siteHeader = readFileSync(new URL("../src/components/layout/site-header.tsx", import.meta.url), "utf8");
	const homeCarousel = readFileSync(new URL("../src/components/home/home-carousel.tsx", import.meta.url), "utf8");
	const animalTabs = readFileSync(new URL("../src/components/home/animal-tabs.tsx", import.meta.url), "utf8");
	const productAnimals = readFileSync(new URL("../src/lib/product-animals.ts", import.meta.url), "utf8");
	const productGrid = readFileSync(new URL("../src/components/product/product-grid.tsx", import.meta.url), "utf8");
	const sparkleRain = readFileSync(new URL("../src/components/home/home-sparkle-rain.tsx", import.meta.url), "utf8");
	const shelf = readFileSync(new URL("../src/components/product/product-shelf.tsx", import.meta.url), "utf8");
	const productActions = readFileSync(new URL("../src/app/product-card-actions.css", import.meta.url), "utf8");
	const collections = readFileSync(new URL("../src/app/shop/page.tsx", import.meta.url), "utf8");
	for (const key of ["home.category_rail.aria_label", "home.size.marquee_label", "home.size.marquee_big_hugs", "home.image_alt.lifestyle", "home.image_alt.domina", "home.size.image_alt"]) {
		assert.ok(homePage.includes(key), `homepage does not use ${key}`);
	}
	for (const key of ["home.aisles.empty_title", "home.aisles.empty", "home.aisles.view_all", "home.aisles.wall_decor_sub"]) {
		assert.ok(homePage.includes(key), `homepage does not use ${key}`);
	}
	assert.doesNotMatch(homePage, /New products in this category are coming soon/);
	assert.match(homeStyles, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
	assert.match(homePage, /t\("home\.size\.image_alt", \{ size: t\(`shop\.size\.\$\{tile\.name\.toLowerCase\(\)\}`\) \}\)/);
	assert.match(homePage, /"plush-toys": \{ card: "[^"]+", hero: "\/images\/home-hero\/plush-room-hd\.png" \}/);
	assert.match(homePage, /"soft-furniture": \{ card: "[^"]+", hero: "\/images\/home-hero\/soft-furniture-hero\.png" \}/);
	assert.match(homePage, /oversized: \{ card: "[^"]+", hero: "\/images\/home-hero\/oversized-room-hd\.png" \}/);
	assert.match(homePage, /cushions: \{ card: "[^"]+", hero: "\/images\/home-hero\/decor-room-hd\.png" \}/);
	assert.match(sparkleRain, /const particleCount = isMobile \? 140 : 320/);
	assert.match(sparkleRain, /Math\.random\(\) < 0\.62/);
	assert.match(homePage, /className="home-marketplace-intro"[^>]*data-sparkle-end/);
	assert.match(sparkleRain, /getBoundingClientRect\(\)\.bottom \+ window\.scrollY/);
	assert.match(sparkleRain, /end - fadeDistance/);
	assert.match(productAnimals, /tags: \["puppy", "dog", "corgi"\]/);
	assert.match(productAnimals, /tags: \["bunny", "rabbit"\]/);
	assert.match(productAnimals, /tags: \["cat", "kitten", "kitty"\]/);
	assert.match(productAnimals, /name: "All animals", key: "shop\.category\.all", slug: "all", tags: \[\]/);
	assert.match(productAnimals, /return tags\.length === 0 \|\| tags\.some/);
	assert.match(animalTabs, /import \{ animalFilters, matchesAnimal \} from "@\/lib\/product-animals"/);
	assert.match(animalTabs, /\.slice\(0, 8\)/);
	assert.match(animalTabs, /fillColumns=\{\[2,\s*3,\s*5,\s*5\]\}/);
	assert.match(homePolishStyles, /@media \(min-width: 1024px\) and \(max-width: 1279px\) \{\s*\.animal-tabs-section \[role="tabpanel"\] \.product-grid \{\s*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
	assert.match(homePolishStyles, /\.animal-tabs-section \[role="tabpanel"\] \.product-grid \{\s*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
	assert.match(homePolishStyles, /\.store-home \.marketplace-aisle \{[^}]*border-radius:\s*0\s*!important/s);
	assert.match(homePolishStyles, /@media \(max-width: 767px\) \{[\s\S]*?\.store-home \.marketplace-aisles-grid>\.marketplace-aisle \{[^}]*min-height:\s*0;/);
	assert.match(productGrid, /key: "drops"[\s\S]*key: "all"[\s\S]*key: "domina"/);
	assert.doesNotMatch(homePage, /home\.size\.\$\{tile\.name\.toLowerCase\(\)\}/);
	assert.match(homeCarousel, /alt=\{slide\.imageAlt\}/);
	assert.doesNotMatch(homeCarousel, /premiumSlide|rareSlide|home\.slides\.(premium|rare)_/);
	assert.match(homePage, /products\.filter\(isDominaXLProduct\)\.slice\(0, 6\)/);
	assert.match(collections, /t\("shop\.filter\.category"\)/);
	assert.doesNotMatch(collections, /shop\.filter\.product_category/);
	assert.match(collections, /return isDominaXLProduct\(product\)/);
	assert.match(productActions, /white-space:\s*normal/);
	assert.match(productActions, /position:\s*absolute/);
	assert.match(homeCarousel, /home\.slides\.choose_collection/);
	assert.match(siteHeader, /className="domina-link"><span>\{t\("home\.header\.domina", "DOMINA by Ponyo"\)\}/);
	assert.match(shelf, /home\.most_loved\.eyebrow/);
});
