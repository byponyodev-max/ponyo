import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(
	new URL("../src/app/theme-parity-polish.css", import.meta.url),
	"utf8",
);
const page = readFileSync(
	new URL("../src/app/pages/[slug]/page.tsx", import.meta.url),
	"utf8",
);
const collectionCss = readFileSync(
	new URL("../src/app/collection-theme.css", import.meta.url),
	"utf8",
);

test("delivery information hero fills the viewport while FAQ content stays in a readable container", () => {
	const ponyoFaqTheme = collectionCss.slice(collectionCss.lastIndexOf(".faq-page {"));
	assert.match(page, /function FaqPage\(\) \{\s*return <div className="faq-page">\s*<header className="faq-page-header">/);
	assert.match(page, /<div className="faq-page-content store-container">/);
	assert.match(page, /faq-jellyfish--gold"><JellyfishArtwork id="faq-hero-gold" tone="gold"/);
	assert.match(page, /faq-jellyfish--gold-secondary"><JellyfishArtwork id="faq-hero-gold-secondary" tone="gold"/);
	assert.match(page, /faq-art-centerpiece"><JellyfishArtwork id="faq-hero-center" tone="gold"/);
	assert.match(css, /\.faq-art-centerpiece\s*\{[^}]*top:\s*50%;[^}]*left:\s*50%;/s);
	assert.match(
		css,
		/\.faq-page-header\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*calc\(100svh - 82px\);[^}]*border-radius:\s*0;/s,
	);
	assert.match(css, /\.faq-jellyfish\s*\{[^}]*animation:\s*faq-jellyfish-drift 7s ease-in-out infinite;/s);
	assert.match(css, /@keyframes faq-jellyfish-drift/);
	assert.match(css, /@keyframes faq-hero-shimmer/);
	assert.match(ponyoFaqTheme, /\.faq-page \.faq-topic\s*\{[^}]*background:\s*linear-gradient\(145deg, #5a2430 0%, #351621 100%\);/s);
	assert.match(ponyoFaqTheme, /\.faq-page \.faq-page-header\s*\{[^}]*linear-gradient\(118deg, #24110f 0%, #4a172b 53%, #2a1019 100%\);/s);
	assert.match(
		css,
		/@media \(max-width: 760px\) \{[\s\S]*?\.faq-page-header\s*\{[^}]*min-height:\s*calc\(100svh - 72px\);[^}]*border-radius:\s*0;/,
	);
});

test("mobile FAQ navigation can wrap within a full-width header", () => {
	assert.match(
		css,
		/\.faq-page-header\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s,
	);
	assert.match(css, /\.faq-page-header nav a\s*\{[^}]*white-space:\s*normal;/s);
	assert.match(
		css,
		/\.faq-page-header nav a:last-child\s*\{[^}]*justify-self:\s*stretch;/s,
	);
});

test("mobile FAQ headings reserve a second row for the answer count", () => {
	assert.match(
		css,
		/\.faq-topic>div\.faq-topic-heading:first-of-type\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*42px minmax\(0,\s*1fr\);/s,
	);
	assert.match(
		css,
		/\.faq-topic-heading \.faq-question-count\s*\{[^}]*grid-row:\s*2;/s,
	);
});

test("mobile shipping timeline uses compact vertical connectors without rotation", () => {
	assert.match(
		css,
		/\.shipping-journey-connector\s*\{[^}]*transform:\s*none;[^}]*font-size:\s*0;/s,
	);
	assert.match(css, /\.shipping-journey-connector::after\s*\{/);
	assert.doesNotMatch(
		css,
		/\.shipping-journey-connector\s*\{[^}]*transform:\s*rotate\(90deg\)/s,
	);
});

test("open FAQ rows rotate only the toggle and keep mobile question text readable", () => {
	assert.match(
		css,
		/\.faq-topic details\[open\] summary \.faq-toggle\s*\{[^}]*transform:\s*rotate\(45deg\);/s,
	);
	assert.doesNotMatch(
		css,
		/\.faq-topic details\[open\] summary span\s*\{[^}]*transform:\s*rotate\(45deg\);/s,
	);
	assert.match(css, /\.faq-topic summary\s*\{[^}]*font-size:\s*14px;/s);
	assert.match(
		css,
		/\.shipping-journey article strong\s*\{[^}]*font-size:\s*13px;/s,
	);
	assert.match(
		css,
		/\.shipping-journey article small\s*\{[^}]*font-size:\s*12px;/s,
	);
});
