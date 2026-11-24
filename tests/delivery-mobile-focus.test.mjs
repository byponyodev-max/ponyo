import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file) => readFileSync(new URL(file,
    import.meta.url), "utf8");

test("country search avoids iOS focus zoom without disabling user zoom", () => {
    const component = read("../src/components/layout/delivery-region-banner.tsx");
    const input = component.match(/<input\s+type="search"[^\n]*?\/>/)?.[0];
    assert.ok(input);
    assert.doesNotMatch(input, /autoFocus/);
    assert.match(input, /aria-label=/);
    const css = read("../src/app/theme-parity-polish.css");
    assert.match(css, /\.delivery-country-search input\s*\{[^}]*font-size: 16px;/);
    assert.match(css, /@media \(hover: none\),\s*\(pointer: coarse\)\s*\{\s*\.localization-search input\s*\{\s*font-size: 16px;/);
    assert.doesNotMatch(read("../src/app/layout.tsx"), /userScalable:\s*false|maximumScale:\s*1/);
});

test("searchable select input is larger and remains zoom-safe on mobile", () => {
    const component = read("../src/components/ui/ponyo-select.tsx");
    const css = read("../src/components/ui/ponyo-select.module.css");
    assert.match(component, /searchable \? 60 : 0/);
    assert.match(css, /\.search\s*\{[^}]*height: 52px;/);
    assert.match(css, /\.search > span\s*\{[^}]*font-size: 19px;/);
    assert.match(css, /\.search input\s*\{[^}]*font-size: 16px;/);
});

test("choosing a country closes the dialog and dismisses the shipping notice", () => {
    const component = read("../src/components/layout/delivery-region-banner.tsx");
    const selection = component.split('aria-selected={country === item.code}')[1].split('}}>')[0];
    assert.ok(selection.includes("setModalOpen(false)"));
    assert.ok(selection.includes("setDeliveryCountry(item.code)"));
    assert.ok(selection.includes("dismissDeliveryNotice()"));
    assert.doesNotMatch(selection, /await/);
});

test("delivery chooser is portaled above the fixed mobile navigation", () => {
    const component = read("../src/components/layout/delivery-region-banner.tsx");
    const css = read("../src/app/theme-parity-polish.css");
    assert.match(component, /createPortal\([\s\S]*?delivery-location-backdrop[\s\S]*?document\.body/);
    assert.match(css, /\.delivery-location-backdrop\s*\{[^}]*z-index:\s*12000;/);
});

test("product search has a zoom-safe font and focuses without scrolling the page", () => {
    const css = read("../src/app/theme-parity-polish.css");
    assert.match(css, /\.predictive-search-popover \.predictive-search-form input\s*\{[^}]*font-size: 16px;[^}]*min-width: 0;/);
    const search = read("../src/components/layout/store-search.tsx");
    assert.ok(search.includes("inputRef.current?.focus({ preventScroll: true })"));
});