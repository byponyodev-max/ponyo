import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("rare drop links open the dedicated localized newsletter signup page", () => {
    const footer = read("src/components/layout/site-footer.tsx");
    const header = read("src/components/layout/site-header.tsx");
    const productGrid = read("src/components/product/product-grid.tsx");
    const newsletter = read("src/components/layout/newsletter-panel.tsx");
    const page = read("src/app/rare-alerts/page.tsx");
    assert.match(footer, /"home\.footer\.drops",\s*"Rare drop alerts",\s*"\/rare-alerts"/);
    assert.match(header, /key: "home\.announce_3", href: "\/rare-alerts"/);
    assert.match(productGrid, /key: "drops", href: "\/rare-alerts"/);
    assert.match(page, /<NewsletterPanel rareAlerts \/>/);
    assert.match(newsletter, /store-newsletter--rare-alerts/);
    assert.match(newsletter, /ponyoApi\.subscribeNewsletter/);
});

test("Rare Alerts has generous header spacing and an animated gold jellyfish", () => {
    const newsletter = read("src/components/layout/newsletter-panel.tsx");
    const styles = read("src/app/footer-experience.css");
    assert.match(newsletter, /JellyfishArtwork id="rare-alerts-feature" tone="gold"/);
    assert.match(styles, /\.rare-alerts-page\s*\{[^}]*padding-block:\s*clamp\(54px/);
    assert.match(styles, /@keyframes rare-alerts-jellyfish-drift/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.rare-alerts-jellyfish\s*\{[^}]*animation:\s*none;/);
});

test("About Ponyo uses ornate gold accents throughout the page", () => {
    const styles = read("src/app/footer-experience.css");
    assert.match(styles, /\.about-page \.about-hero::before\s*\{[^}]*border:\s*1px solid rgb\(185 145 65 \/ 30%\);/);
    assert.match(styles, /\.about-page \.about-eyebrow\s*\{[^}]*border:\s*1px solid #c6a45e;/);
    assert.match(styles, /\.about-page \.about-promise-grid article > span\s*\{[^}]*background:\s*linear-gradient\(145deg, #fff5d5, #dfc27c\);/);
    assert.match(styles, /\.about-page \.about-closing\s*\{[^}]*linear-gradient\(120deg, #35261d, #4a3728 55%, #302219\)/);
});

test("collection headers use an editorial eyebrow and retain their artwork on mobile", () => {
    const shop = read("src/app/shop/page.tsx");
    const styles = read("src/app/collection-theme.css");
    assert.match(shop, /className="collection-heading-eyebrow"/);
    assert.match(shop, /className="collection-heading-image-stamp"/);
    assert.match(shop, /collection-heading-image/);
    assert.match(styles, /\.collection-heading-eyebrow\s*\{/);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?\.collection-page \.collection-heading-image\s*\{[^}]*display:\s*block;/);
    assert.match(styles, /\.collection-page \.collection-tone-cushions/);
    assert.match(styles, /\.collection-page \.collection-tone-soft-furniture/);
    assert.match(styles, /\.collection-page \.collection-tone-new-arrivals[\s\S]*?linear-gradient\(120deg, #f2e3cc, #e4cba7 60%, #d0ad7b\)/);
    assert.match(styles, /\.collection-heading-image-stamp\s*\{[^}]*border:\s*1px solid rgb\(246 226 183 \/ 76%\);/);
});

test("mobile product gallery meets the header and detail accordions have no white cards", () => {
    const styles = read("src/app/maker-reservation.css");
    const headerStyles = read("src/app/theme-parity-polish.css");
    assert.match(headerStyles, /body:has\(\.store-header\.is-mobile-sticky\) \.store-main\s*\{\s*padding-top:\s*56px;/);
    assert.doesNotMatch(styles, /body:has\(\.product-page\) \.store-main\.product-page\s*\{\s*padding-top:\s*0;/);
    assert.match(styles, /\.product-page \.product-details-accordion\s*\{[^}]*width:\s*100%;[^}]*background:\s*transparent;/);
    assert.match(styles, /\.product-page \.product-details-accordion details,\s*\.product-page \.product-details-accordion details\[open\]\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
});

test("mobile quick navigation stays visible on product pages above the sticky purchase bar", () => {
    const themeStyles = read("src/app/theme-parity-polish.css");
    const productStyles = read("src/app/maker-reservation.css");
    assert.doesNotMatch(themeStyles, /body:has\(\.product-page\) \.mobile-tab-bar\s*\{\s*display:\s*none;/);
    assert.match(productStyles, /body:has\(\.product-page\)\s*\{\s*padding-bottom:\s*calc\(67px \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(productStyles, /body:has\(\.product-page \.mobile-sticky-purchase\)\s*\{\s*padding-bottom:\s*calc\(134px \+ env\(safe-area-inset-bottom\)\);/);
    assert.match(productStyles, /\.product-page \.mobile-sticky-purchase\s*\{\s*bottom:\s*67px;/);
});
