import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path,
    import.meta.url), "utf8");
const api = read("../src/services/ponyo-api.client.ts");
const portal = read("../src/app/supplier-portal/page.tsx");
const styles = read("../src/app/supplier-portal.css");
const proxy = read("../src/proxy.ts");
const authRouter = read("../backend/app/routers/supplier_auth.py");
const supplierCatalog = read("../backend/app/routers/supplier_catalog.py");
const supplierOrders = read("../backend/app/routers/supplier_orders.py");

test("supplier API client uses the protected auth and purchase-order endpoints", () => {
    for (const value of[
            '"/supplier-auth/login"',
            '"/supplier-auth/me"',
            "`/supplier-orders?limit=${limit}&offset=${offset}`",
            "`/supplier-orders/${encodeURIComponent(id)}`",
            "/confirmation",
        ])
        assert.ok(api.includes(value), `missing supplier API endpoint: ${value}`);
});

test("supplier listings update approved offer stock and private wholesale terms through the API", () => {
    for (const value of[
            "/supplier-catalog/offers?limit=${limit}",
            "/supplier-catalog/offers/${encodeURIComponent(offerId)}",
            "onHand: number",
            "costAmount: number",
        ])
        assert.ok(
            api.includes(value),
            `missing supplier catalog client contract: ${value}`,
        );
    for (const value of[
            "/offers",
            "SupplierOffer.supplier_id == supplier_id",
            "payload.onHand < inventory.reserved",
            "offer.cost_amount = payload.costAmount",
            "await refresh_synced_variant(db, variant.id)",
        ])
        assert.ok(
            supplierCatalog.includes(value),
            `missing supplier catalog API behavior: ${value}`,
        );
    assert.ok(portal.includes("Save listing updates"));
    assert.ok(portal.includes("Storefront retail price"));
    assert.ok(
        portal.includes("Ponyo keeps retail prices and product content curated"),
    );
});

test("supplier server auth checks verified role, active assignment, and CSRF on writes", () => {
    for (const value of[
            'require_roles("supplier")',
            'customer.role != "supplier"',
            "if not supplier or not supplier.active",
            "require_csrf(request)",
        ])
        assert.ok(authRouter.includes(value), `missing auth guard: ${value}`);
    assert.ok(!authRouter.toLowerCase().includes("register"));
    assert.ok(!authRouter.includes("create_supplier_role"));
});

test("supplier portal supports PO review, detail disclosure, and explicit confirmation decisions", () => {
    for (const value of[
            "Purchase orders",
            "Items to prepare",
            "detail.shippingAddress",
            "globalThis.crypto.randomUUID()",
            "Confirm purchase order",
            "Unable to fulfill this order",
        ])
        assert.ok(portal.includes(value), `missing portal feature: ${value}`);
    assert.ok(
        supplierOrders.includes(
            "Only the assigned supplier/admin can access the delivery address",
        ),
    );
});

test("supplier workspace adopts Ponyo palette and a compact mobile layout", () => {
    assert.ok(styles.includes("--sp-peach: #fff1e8"));
    assert.ok(styles.includes("--sp-mint: #e9f5f0"));
    assert.ok(styles.includes("@media (max-width: 760px)"));
    assert.match(
        styles,
        /\.sp-content-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    assert.match(styles, /\.sp-listing-form label\s*\{[^}]*font-size:\s*13px;/s);
    assert.match(
        styles,
        /\.sp-order-row-main strong\s*\{[^}]*font-size:\s*14px;/s,
    );
    assert.ok(styles.includes("/* High-readability scale: prioritize legibility over compact density. */"));
    assert.ok(styles.includes(".sp-login-form label,\n.sp-decision-form>label:not(.sp-check-row),\n.sp-listing-form label,\n.sp-detail-label,\n.sp-nav-item,\n.sp-mobile-nav button {\n    font-size: 16px;"));
});

test("supplier subdomain root rewrites to the portal without redirecting storefront traffic", () => {
    assert.ok(proxy.includes('?? "supplier.byponyo.com"'));
    assert.ok(proxy.includes('request.nextUrl.pathname !== "/"'));
    assert.ok(proxy.includes('destination.pathname = "/supplier-portal"'));
    assert.ok(proxy.includes("NextResponse.rewrite(destination)"));
});