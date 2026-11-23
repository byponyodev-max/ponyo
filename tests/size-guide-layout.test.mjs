import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync(new URL("../src/app/size-guide/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/maker-reservation.css", import.meta.url), "utf8");

test("size guide uses real catalog photos and animated gold-and-silver accents", () => {
  assert.match(page, /Image src=\{heroExample\.image\} alt=\{heroExample\.imageAlt\} fill/);
  assert.match(page, /Image className="size-guide-page-reference" src=\{example\.image\} alt=\{example\.imageAlt\}/);
  assert.match(page, /JellyfishArtwork id="size-guide-page-silver" tone="silver"/);
  assert.match(page, /JellyfishArtwork id="size-guide-page-gold" tone="gold"/);
  assert.match(page, /className="size-guide-page-card-index" aria-hidden="true"/);
  assert.doesNotMatch(page, /size-guide-page-bar/);
  assert.match(styles, /\.size-guide-page-reference \{[^}]*object-fit: contain/);
  assert.match(styles, /@keyframes size-guide-page-float/);
  assert.match(styles, /@keyframes size-guide-page-sparkle/);
  assert.match(styles, /@keyframes size-guide-page-sheen/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.size-guide-page-jellyfish,[\s\S]*?animation: none;/);
});
