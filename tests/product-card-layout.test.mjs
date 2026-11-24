import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function load(path, mocks = {}) {
	const source = ts.transpileModule(read(path), {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
			jsx: ts.JsxEmit.ReactJSX,
		},
	}).outputText;
	const context = {
		exports: {},
		require: (id) => (id in mocks ? mocks[id] : require(id)),
	};
	vm.runInNewContext(source, context);
	return context.exports;
}

const { selectRelatedProducts } = load("../src/lib/related-products.ts");
const product = { id: "current", categoryName: "Bears", tags: ["premium"] };
const item = (id, categoryName = "Cats", tags = []) => ({
	id,
	categoryName,
	tags,
});

test("recommendations prefer related products and fill six distinct slots without the current product", () => {
	const products = [
		product,
		item("other-1"),
		item("bear", "Bears"),
		item("premium", "Cats", ["premium"]),
		item("other-2"),
		item("other-3"),
		item("other-4"),
		item("other-5"),
		item("bear", "Bears"),
	];
	assert.deepEqual(
		Array.from(selectRelatedProducts(products, product), ({ id }) => id),
		["bear", "premium", "other-1", "other-2", "other-3", "other-4"],
	);
	assert.equal(selectRelatedProducts([product], product).length, 0);
	assert.equal(
		selectRelatedProducts([product, item("only")], product).length,
		1,
	);
	assert.equal(selectRelatedProducts(products.slice(1), product).length, 6);
});

test("the detail page passes six-item selection to its recommendations grid using the full catalog request", () => {
	const page = read("../src/app/products/[id]/page.tsx");
	assert.match(page, /getLocalizedProducts\("\?limit=100"\)/);
	assert.match(
		page,
		/const related = selectRelatedProducts\(products, product\)/,
	);
	assert.match(
		page,
		/className="related-products store-container"[\s\S]*<ProductGrid products=\{related\}/,
	);
});

test("the detail page shows maker-supplied facts and only shows the exclusivity badge when verified", () => {
	const page = read("../src/app/products/[id]/page.tsx");
	const makerPage = read("../src/app/makers/[slug]/page.tsx");
	assert.match(page, /const proofFacts = \[/);
	for (const proof of [
		"maker",
		"story",
		"materials",
		"size",
		"edition",
		"delivery",
	]) {
		assert.match(page, new RegExp(`key: "${proof}"`));
	}
	assert.match(page, /\{product\.onlyAtPonyo && <span className="product-gallery-approval-badge">/);
	assert.match(page, /className="product-gallery-approval-star" aria-hidden="true">★/);
	assert.match(
		page,
		/\{product\.makerSlug && <Link className="product-brand-story"/,
	);
	assert.match(makerPage, /getLocalizedProducts\("\?limit=100", locale\)/);
	assert.match(makerPage, /product\.makerSlug === slug/);
});

load("../src/components/product/product-card.tsx", {
	"next/image": { default: "img" },
	"next/link": { default: "a" },
	"@/lib/wishlist": { saveWishlist() {}, useWishlistHandles: () => [] },
	"@/components/product/product-card-action": {
		ProductCardAction: "ProductCardAction",
	},
	"@/lib/storefront-features": {
		storefrontFeatures: { productReservations: false, commerce: false },
	},
	"@/lib/localization-options": {
		regionName: (code) => code,
	},
	"@/lib/product-shipping": {
		getProductShippingStatus: (item, country) => {
			if (item.shippingCountries == null) return "unconfirmed";
			return item.shippingCountries.includes(country) ? "deliverable" : "unavailable";
		},
	},
	"@/components/layout/localization-provider": {
		useLocalization: () => ({
			country: "JP",
			language: "en",
			formatPrice: (amount) => `IDR\u00a0${amount.toLocaleString("de-DE")}`,
			t: (_, fallback) => fallback,
		}),
	},
});

const { getProductShippingStatus, sortProductsByDelivery } = load("../src/lib/product-shipping.ts");

test("delivery sorting keeps the full catalog and prioritizes deliverable products stably", () => {
	const products = [
		{ id: "unknown", shippingCountries: null },
		{ id: "not-jp", shippingCountries: ["KR"] },
		{ id: "jp", shippingCountries: ["JP"] },
	];
	const sorted = sortProductsByDelivery(products, "JP");
	assert.deepEqual(Array.from(sorted, ({ id }) => id), ["jp", "unknown", "not-jp"]);
	assert.equal(sorted.length, products.length);
	assert.equal(getProductShippingStatus(products[0], "JP"), "unconfirmed");
	assert.equal(getProductShippingStatus(products[1], "JP"), "unavailable");
});

test("product cards show the current price without sale-price claims", () => {
	const cardSource = read("../src/components/product/product-card.tsx");
	assert.match(cardSource, /className="shop-product-current-price"/);
	assert.doesNotMatch(cardSource, /<del>|discountPercent|compareAtAmount/);
});

test("product cards and detail pages do not show redundant Premium or Rare labels", () => {
	const cardSource = read("../src/components/product/product-card.tsx");
	const productGrid = read("../src/components/product/product-grid.tsx");
	const productShelf = read("../src/components/product/product-shelf.tsx");
	const shopPage = read("../src/app/shop/page.tsx");
	const animalTabs = read("../src/components/home/animal-tabs.tsx");
	const purchasePanel = read("../src/components/product/product-purchase-panel.tsx");
	assert.doesNotMatch(cardSource, /product\.label\.(?:premium|rare)|tags\.includes\("(?:premium|rare)"\)/);
	assert.doesNotMatch(productGrid, /\bbadges\b|badge=\{/);
	assert.doesNotMatch(productShelf, /\bbadges\b/);
	assert.doesNotMatch(shopPage, /shop\.badge\.(?:premium|rare)|const badges/);
	assert.doesNotMatch(animalTabs, /badges=|["']Rare["']/);
	assert.doesNotMatch(purchasePanel, /product-rarity|product\.label\.rare/);
	assert.match(cardSource, /product\.label\.new/);
	assert.match(cardSource, /product\.label\.xl/);
});

test("product shelves keep unmapped copy without queuing an empty translation key", () => {
	const calls = [];
	const { ProductShelf } = load("../src/components/product/product-shelf.tsx", {
		"react/jsx-runtime": {
			jsx: (type, props) => ({ type, props }),
			jsxs: (type, props) => ({ type, props }),
		},
		"next/link": { default: "a" },
		"@/components/product/product-grid": { ProductGrid: "ProductGrid" },
		"@/components/layout/localization-provider": {
			useLocalization: () => ({
				t: (key, fallback) => {
					calls.push({ key, fallback });
					return fallback;
				},
			}),
		},
	});
	const textContent = (node) => {
		if (typeof node === "string") return node;
		if (Array.isArray(node)) return node.map(textContent).join("");
		return node && typeof node === "object"
			? textContent(node.props?.children)
			: "";
	};

	const eyebrow = "An unmapped eyebrow";
	const description = "An unmapped description";
	const tree = ProductShelf({
		id: "unmapped",
		eyebrow,
		title: "Unmapped title",
		description,
		products: [],
	});

	assert.deepEqual(calls, [{ key: "home.see_all", fallback: "Shop all →" }]);
	assert.ok(textContent(tree).includes(eyebrow));
	assert.ok(textContent(tree).includes(description));

	calls.length = 0;
	ProductShelf({
		id: "new-arrivals",
		eyebrow: "Just landed",
		title: "Just landed",
		description: "The newest plush on Ponyo.",
		products: [],
		linkLabel: "See all →",
	});
	assert.deepEqual(calls.map(({ key }) => key), [
		"home.v2.new_title",
		"home.v2.new_sub",
		"home.shelf.new_eyebrow",
		"home.v2.see_all",
	]);
});

test("product cards show reservation or interest actions while commerce is paused", () => {
	const cardSource = read("../src/components/product/product-card.tsx");
	const cardActionSource = read("../src/components/product/product-card-action.tsx");
	assert.match(cardSource, /storefrontFeatures\.productReservations && <ProductCardAction/);
	assert.match(cardActionSource, /getProductShippingStatus\(product, country\)/);
	assert.match(cardActionSource, /href=\{`\/products\/\$\{encodeURIComponent\(product\.id\)\}#\$\{target\}`\}/);
	assert.match(cardActionSource, /canShipToCountry \? t\("product\.action\.reserve_spot"/);
	assert.match(cardActionSource, /: t\("product\.action\.register_interest"/);
	assert.match(cardActionSource, /shippingStatus === "deliverable" && !product\.reservationsOpen/);
	assert.doesNotMatch(cardSource, /add_to_cart|Notify me|<del>/);
	assert.match(cardSource, /href=\{`\/products\/\$\{product\.id\}`\}/);
});

test("product waitlist shows the lantern-lit waiting-list character panorama", () => {
	const community = read("../src/components/product/product-community.tsx");
	const css = read("../src/app/theme-parity-polish.css");
	assert.match(
		community,
		/className="product-waitlist-lineup" aria-hidden="true"/,
	);
	assert.match(
		community,
		/className="product-waitlist-layout">\s*<section className="product-waitlist"[\s\S]*?<\/section>\s*<div className="product-waitlist-side-art"[\s\S]*className="product-waitlist-side-copy"[\s\S]*A little magic/,
	);
	assert.match(
		community,
		/className="product-waitlist-side-constellation" viewBox="0 0 600 180"[\s\S]*product-waitlist-starfall/,
	);
	assert.doesNotMatch(community, /product-waitlist-side-arrow/);
	assert.match(
		community,
		/src="\/images\/waiting-list-transparent\.png" alt="" fill loading="eager" unoptimized/,
	);
	assert.match(
		css,
		/\.product-waitlist-lineup\s*\{[^}]*aspect-ratio: 1010 \/ 287;[^}]*background: radial-gradient\(ellipse at 50% 70%, #f9d98438/,
	);
	assert.match(
		css,
		/\.product-waitlist-side-art\s*\{[^}]*width: min\(50vw, 680px\);[^}]*right: calc\(100% \+ clamp\(46px, 5vw, 78px\)\)/,
	);
	assert.match(
		css,
		/\.product-waitlist-starfall\s*\{[^}]*animation: waitlist-starfall/,
	);
	assert.match(
		css,
		/\.product-waitlist-side-copy\s*\{[^}]*text-align: center;/,
	);
	assert.doesNotMatch(
		css,
		/waitlist-constellation-drift|product-waitlist-side-arrow/,
	);
	assert.match(
		css,
		/@media \(min-width: 768px\) and \(max-width: 1023px\)\s*\{\s*\.product-waitlist-lineup\s*\{\s*display: block;/,
	);
	const mobileWaitlistCss = css.slice(
		css.indexOf(
			"@media (max-width: 767px)",
			css.indexOf("@keyframes waitlist-sparkle"),
		),
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup\s*\{[^}]*width: 100vw;[^}]*height: clamp\(116px, 34vw, 138px\)/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup\s*\{[^}]*border-top: 0;/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup img\s*\{[^}]*object-fit: contain;[^}]*object-position: center bottom;/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-lineup\s*\{[^}]*border-top: 0;/,
	);
	assert.match(
		mobileWaitlistCss,
		/\.product-waitlist-side-art\s*\{\s*display: none;/,
	);
	assert.match(
		css,
		/\.product-waitlist-lineup-glow\s*\{[^}]*filter: blur\(18px\);[^}]*animation: waitlist-lantern-glow/,
	);
	assert.match(css, /@keyframes waitlist-friends-float/);
	assert.match(
		css,
		/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.product-waitlist-lineup img,[^}]*animation: none;/,
	);
	assert.ok(read("../public/images/waiting-list-transparent.png"));
});

test("home does not promote the retired Coming Soon notify shelf", () => {
	const page = read("../src/app/page.tsx");
	assert.doesNotMatch(page, /comingSoon|id="coming-soon"|HomeInterestForms|Ask us to let you know/);
});

test("size guide keeps large jellyfish and Domina quote outside the size tiles", () => {
	const page = read("../src/app/page.tsx");
	const headerJellyfish = page.indexOf("{sizeGuideJellyfish.map");
	const tiles = page.indexOf('<div className="size-guide-tiles">');
	assert.ok(headerJellyfish >= 0 && tiles > headerJellyfish);
	assert.ok(page.includes('className="domina-quote-marquee"'));
	assert.ok(page.includes('className="size-guide-light"'));
});

test("homepage intro uses one large plush lineup and places it after the actions on mobile", () => {
	const css = read("../src/app/theme-parity-polish.css");
	assert.match(css, /\.home-marketplace-intro\s*\{[^}]*background: #fff/);
	assert.match(
		css,
		/\.home-marketplace-intro::before\s*\{[^}]*z-index: -1;[^}]*width: 100vw/,
	);
	assert.match(css, /background: url\("\/images\/plushies-home-3\.png"\)/);
	assert.match(css, /opacity: \.62/);
	assert.equal(
		(css.match(/url\("\/images\/plushies-home-3\.png"\)/g) || []).length,
		1,
	);
	assert.match(css, /\.home-marketplace-intro::after\s*\{\s*content: none;/);
	const mobile = css.slice(
		css.indexOf("/* Desktop homepage: keep size cards orderly"),
	);
	assert.match(
		mobile,
		/@media \(max-width: 767px\)[\s\S]*\.home-marketplace-intro::before\s*\{[^}]*position: relative;[^}]*order: 1;[^}]*aspect-ratio: 1024 \/ 216;[^}]*background-size: contain;[^}]*transform: none;/,
	);
	assert.match(
		css,
		/\.home-marketplace-intro>\*\s*\{[^}]*position: relative;[^}]*z-index: 1/,
	);
});

test("mobile size guide has an edge-to-edge ticker and decorative jellyfish above the portraits", () => {
	const css = read("../src/app/home-size-spotlight.css");
	const page = read("../src/app/page.tsx");
	const mobile = css.split("@media (max-width: 767px)")[1];
	assert.match(
		mobile,
		/\.domina-quote-marquee\s*\{[^}]*width: 100vw;[^}]*margin: 0 calc\(50% - 50vw\) 12px;[^}]*mask-image: none;/,
	);
	assert.match(css, /\.size-guide-mobile-jellyfish\s*\{\s*display: none;/);
	assert.match(
		mobile,
		/\.size-guide-mobile-jellyfish\s*\{[^}]*position: absolute;[^}]*display: block;[^}]*pointer-events: none;/,
	);
	assert.match(
		page,
		/className="size-guide-tiles">[\s\S]*className="size-guide-mobile-jellyfish" aria-hidden="true">[\s\S]*sizeGuideJellyfish\.slice\(0, 3\)/,
	);
	assert.match(page, /id=\{`size-guide-mobile-\$\{jellyfish\.tone\}`\}/);
});

test("footer has a themed image banner, animation, and social links", () => {
	const footer = read("../src/components/layout/site-footer.tsx");
	const css = read("../src/app/footer-experience.css");
	assert.ok(footer.includes("/images/footer-plush-lineup.png"));
	assert.ok(footer.includes('className="footer-plush-lineup"'));
	assert.ok(!footer.includes('className="footer-visual"'));
	assert.ok(footer.includes('name: "Instagram"'));
	assert.ok(footer.includes('name: "TikTok"'));
	assert.ok(footer.includes('name: "YouTube"'));
	assert.ok(footer.includes('name: "Threads"'));
	assert.match(footer, /instagram\.com\/hello\.byponyo/);
	assert.match(footer, /tiktok\.com\/@hello\.byponyo/);
	assert.match(footer, /youtube\.com\/@hello\.byponyo/);
	assert.match(footer, /threads\.net\/@hello\.byponyo/);
	assert.match(footer, /Channel: hello\.byponyo/);
	assert.ok(footer.includes('className="footer-social"'));
	assert.match(
		css,
		/\.footer-plush-lineup[\s\S]*object-fit: cover;[\s\S]*object-position: center bottom;/,
	);
	assert.match(css, /\.footer-social-links/);
	assert.match(css, /\.footer-social-links\s*\{[^}]*flex-wrap:\s*nowrap;/);
	assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1100px\)[\s\S]*?\.footer-social-links\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
	assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.footer-social-links\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
	assert.match(
		footer,
		/className="footer-plush-lineup"[\s\S]*className="footer-social"/,
	);
});

test("overflow rules reserve wishlist space and six columns are scoped to detail recommendations", () => {
	const css = read("../src/app/theme-parity-polish.css").split(
		"/* Scoped product-card overflow fixes and product-detail recommendations only. */",
	)[1];
	assert.ok(css, "scoped append-only CSS section exists");
	assert.match(
		css,
		/\.shop-product-card \.product-labels\s*\{[^}]*right: 56px;[^}]*flex-wrap: wrap;/,
	);
	assert.match(
		css,
		/\.product-labels \.product-label\s*\{[^}]*font-size: 9px;[^}]*overflow-wrap: anywhere;/,
	);
	assert.match(
		css,
		/\.shop-product-bottom \.shop-product-prices\s*\{[^}]*flex-wrap: wrap;[^}]*font-size: clamp\(15px, 10cqi, 22px\);/,
	);
	assert.match(
		css,
		/@media \(min-width: 1200px\)\s*\{\s*\.product-page \.related-products\s*>\s*\.product-grid\s*\{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/,
	);
	assert.match(css, /repeat\(2, minmax\(0, 1fr\)\)/);
	assert.match(css, /repeat\(3, minmax\(0, 1fr\)/);
});

test("desktop size guide scales square portraits rather than clipping shallow heads", () => {
	const css = read("../src/app/theme-parity-polish.css");
	assert.match(
		css,
		/a\.size-guide-tile>span\s*\{[^}]*width: min\(100%, var\(--size-portrait\)\);[^}]*height: auto;[^}]*aspect-ratio: 1;[^}]*border-radius: 50% 50% 12px 12px;/,
	);
	assert.match(
		css,
		/a\.size-guide-tile img\s*\{[^}]*object-fit: cover;[^}]*object-position: center;[^}]*transform: none;/,
	);
	const page = read("../src/app/page.tsx");
	assert.ok(
		page.includes("translationKey={`shop.size.${tile.name.toLowerCase()}`}"),
	);
	assert.ok(page.includes("translationKey={`home.size.${tile.rangeKey}`}"));
});
