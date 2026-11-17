import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const header = readFileSync(
	new URL("../src/components/layout/site-header.tsx", import.meta.url),
	"utf8",
);
const styles = readFileSync(
	new URL("../src/app/theme-parity-polish.css", import.meta.url),
	"utf8",
);

test("compact mobile header shows Wishlist in the slot reserved for Profile", () => {
	assert.match(header, /className="smart-icon-trigger smart-wishlist-trigger"/);
	assert.match(
		styles,
		/\.smart-header\.is-shown \.smart-header-actions>\*:not\(\.smart-wishlist-trigger\)\s*\{\s*display: none !important;/,
	);
	assert.match(
		styles,
		/\.smart-header\.is-shown \.smart-wishlist-trigger\s*\{[^}]*grid-column: 3;[^}]*display: grid !important;/s,
	);
	assert.match(
		styles,
		/\.smart-header\.is-shown \.smart-profile-trigger\s*\{\s*display: none !important;/,
	);
});
