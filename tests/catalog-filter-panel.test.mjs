import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("closed catalog filters explicitly remove the panel from layout", () => {
	const css = read("../src/app/collection-theme.css");
	assert.match(
		css,
		/\.all-filters:not\(\[open\]\)\s*>\s*\.all-filters-panel\s*\{\s*display: none;/,
	);
	assert.match(
		css,
		/\.all-filters\[open\]\s*>\s*\.all-filters-panel\s*\{\s*display: block;/,
	);
	assert.match(css, /max-height: min\(78dvh, 640px\)/);
	const fields = css.indexOf(
		"font: 700 13px var(--font-nunito), sans-serif;",
		css.indexOf(".collection-page .catalog-filter-form select"),
	);
	const touch = css.search(
		/@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)/,
	);
	assert.ok(touch > fields, "touch font rule follows the base input font");
	assert.match(
		css.slice(touch),
		/input\[type="number"\]\s*\{\s*font-size: 16px;/,
	);
	assert.match(
		css,
		/\.store-main\.collection-page\s*\{\s*padding-bottom: calc\(84px \+ env\(safe-area-inset-bottom\)\);/,
	);
});

test("catalog filters dismiss outside and with Escape without navigation", () => {
	const source = read("../src/components/product/catalog-filter-panel.tsx");
	assert.ok(source.startsWith('"use client";'));
	assert.match(
		source,
		/document\.addEventListener\("pointerdown", dismissOutside\)/,
	);
	assert.match(
		source,
		/document\.removeEventListener\("pointerdown", dismissOutside\)/,
	);
	assert.match(source, /!details\.contains\(event\.target\)/);
	assert.match(source, /event\.key === "Escape"/);
	assert.match(source, /focus\(\{ preventScroll: true \}\)/);
	assert.match(source, /<form action="\/shop" method="get"/);
	assert.match(source, /open=\{isOpen\}/);
	assert.match(source, /setIsOpen\(\(open\) => !open\)/);
	assert.match(source, /aria-expanded=\{isOpen\}/);
	assert.match(
		source,
		/if \(details && details\.open && event\.target instanceof Node && !details\.contains\(event\.target\)\)\s*\{\s*setIsOpen\(false\)/,
	);
});

test("homepage size guide maps decorative jellyfish tones and keeps the art non-interactive", () => {
	const source = read("../src/app/page.tsx");
	const css = read("../src/app/home-size-spotlight.css");
	assert.match(source, /tone: "silver"/);
	assert.match(source, /tone: "gold"/);
	assert.match(source, /tone=\{jellyfish\.tone\} direction=\{jellyfish\.direction\}/);
	assert.match(source, /aria-hidden="true"><JellyfishArtwork/);
	assert.match(css, /\.size-guide-hero-jellyfish\s*\{[^}]*pointer-events: none;/);
	assert.doesNotMatch(source, /coming-soon-gold|rare-jumbo-silver/);
	assert.match(
		css,
		/\.coming-soon-shelf \.section-head\s*\{[^}]*padding-right: 36%;[^}]*padding-bottom: 0;/,
	);
	assert.match(
		css,
		/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.home-campaign-jellyfish,/,
	);
});
