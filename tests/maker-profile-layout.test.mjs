import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../src/app/makers/[slug]/page.tsx", import.meta.url), "utf8");
const collection = readFileSync(new URL("../src/components/makers/maker-profile-collection.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/maker-reservation.css", import.meta.url), "utf8");
const translations = readFileSync(new URL("../src/locales/app-translations.ts", import.meta.url), "utf8");

test("maker profile keeps its monogram, fixed luxury palette, and full-bleed responsive hero", () => {
  assert.match(page, /maker-profile-monogram" aria-label=\{`\$\{maker\.name\} maker mark`\}/);
  assert.match(page, /className="maker-profile-hero"/);
  assert.doesNotMatch(page, /maker-profile-hero--/);
  assert.doesNotMatch(page, /maker-profile-portrait-image/);
  assert.doesNotMatch(page, /import Image from "next\/image"/);
  assert.match(page, /JellyfishArtwork id="maker-profile-silver" tone="silver"/);
  assert.match(page, /JellyfishArtwork id="maker-profile-gold" tone="gold"/);
  assert.match(page, /maker-profile-stats/);
  assert.match(page, /className="maker-profile-detail-number"/);
  assert.match(page, /<MakerProfileCollection products=\{products\} \/>/);
  assert.match(collection, /type="search"/);
  assert.match(collection, /maker\.profile\.collection\.category_label/);
  assert.match(collection, /maker\.profile\.collection\.animal_label/);
  assert.match(collection, /shop\.sort\.price_ascending/);
  assert.match(collection, /preserveOrder/);
  assert.match(styles, /\.maker-profile-collection \{\s*width: min\(1280px, calc\(100% - clamp\(40px, 8vw, 128px\)\)\)/);
  assert.match(styles, /\.maker-profile-details \{\s*width: min\(1240px, calc\(100% - clamp\(40px, 8vw, 128px\)\)\)/);
  assert.match(styles, /\.maker-profile-collection \.maker-profile-product-grid \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(min-width: 1024px\) \{\s*\.maker-profile-collection \.maker-profile-product-grid \{\s*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 680px\) \{[\s\S]*?\.maker-profile-collection \.maker-profile-product-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.maker-profile-filter-panel\[hidden\]\s*\{\s*display: none;/);
  for (const locale of ["en", "ja", "ko"]) {
    const localeStart = translations.indexOf(`\t${locale}: {`);
    const localeEnd = translations.indexOf("\n\t},", localeStart);
    assert.ok(localeStart >= 0 && localeEnd > localeStart, `${locale} translation block exists`);
    assert.match(translations.slice(localeStart, localeEnd), /"maker\.profile\.collection\.search_label"/);
  }
  assert.match(styles, /\.maker-profile-hero \{[^}]*width: 100%;[^}]*min-height: calc\(100svh - 82px\)/);
  assert.match(styles, /@media \(max-width: 680px\) \{[\s\S]*?\.maker-profile-hero \{[^}]*width: 100%;[^}]*min-height: calc\(100svh - 72px\);[^}]*border-radius: 0;/);
  assert.match(styles, /\.maker-profile-details \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 680px\) \{[\s\S]*?\.maker-profile-details \{[^}]*grid-template-columns: 1fr/);
  assert.match(styles, /@keyframes maker-profile-float/);
  assert.match(styles, /@keyframes maker-profile-rise/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.maker-profile-jellyfish,[\s\S]*?animation: none;/);
  assert.doesNotMatch(styles, /maker-profile-hero--sage|maker-profile-hero--lilac|maker-profile-hero--yellow/);
  assert.doesNotMatch(styles, /#3f594b|#5f765f|#60776a/);
});

test("maker profile sort uses a themed custom dropdown instead of the native select", () => {
  assert.doesNotMatch(collection, /<select|<option/);
  assert.doesNotMatch(styles, /\.maker-profile-sort (?:select|option)/);
  assert.match(collection, /className="maker-profile-sort-trigger"/);
  assert.match(collection, /aria-haspopup="listbox"/);
  assert.match(collection, /className="maker-profile-sort-options" role="listbox"/);
  assert.match(collection, /role="option" aria-selected=\{option\.value === sort\}/);
  assert.match(collection, /event\.key === "Escape" && isSortOpen/);
  assert.match(styles, /\.maker-profile-filter-toggle,\s*\.maker-profile-sort-trigger \{[^}]*background: linear-gradient\(135deg, #4a172b, #32101f\);/);
  assert.match(styles, /\.maker-profile-sort-options \{[^}]*position: absolute;[^}]*linear-gradient\(135deg, #4a172b, #2c0f1c\);/);
  assert.match(styles, /\.maker-profile-sort-options button\[aria-selected="true"\] \{[^}]*background: linear-gradient\(135deg, #ead59c, #c59d5c\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.maker-profile-sort-options \{\s*animation: none;/);
});
