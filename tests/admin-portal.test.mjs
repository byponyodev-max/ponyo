import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path,
    import.meta.url), "utf8");
const page = read("../src/app/admin-portal/page.tsx");
const css = read("../src/app/admin-portal.css");
const api = read("../src/services/ponyo-api.client.ts");
const proxy = read("../src/proxy.ts");
const backend = read("../backend/app/routers/admin.py");

test("admin portal exposes separate login, role-gated operations and its Ponyo subdomain", () => {
    assert.ok(api.includes("/admin-auth/login"));
    assert.ok(page.includes("Enter admin dashboard"));
    assert.ok(page.includes("you@ponyo.com"));
    assert.ok(proxy.includes('?? "admin.byponyo.com"'));
    assert.ok(backend.includes('require_roles("admin")'));
});

test("admin MVP includes overview, orders, product publishing, suppliers and customers", () => {
    for (const value of[
            "Dashboard",
            "Orders",
            "Products",
            "Suppliers",
            "Customers",
            "Fulfillment",
        ]) {
        assert.ok(
            page.includes(value),
            `missing admin workspace section: ${value}`,
        );
    }
    for (const value of[
            "togglePublication",
            "toggleSupplier",
            "getAdminDashboard",
            "getAdminOrder",
        ]) {
        assert.ok(page.includes(value), `missing admin workflow: ${value}`);
    }
    for (const endpoint of[
            "/admin/dashboard",
            "/admin/orders",
            "/admin/products",
            "/admin/suppliers",
            "/admin/customers",
        ]) {
        assert.ok(
            api.includes(endpoint),
            `missing admin API client endpoint: ${endpoint}`,
        );
    }
});

test("dashboard UI uses Ponyo palette and responsive compact navigation", () => {
    assert.ok(css.includes("--ad-peach: #fff1e8"));
    assert.ok(css.includes("--ad-mint: #e9f5f0"));
    assert.ok(css.includes("@media (max-width: 760px)"));
    const readability = css.slice(
        css.lastIndexOf("/* High-readability scale: prioritize legibility over compact density. */"),
    );
    assert.match(css, /\.ad-mobile-nav\s*\{/);
    assert.match(css, /\.ad-table td\s*\{[^}]*font-size:\s*12px;/s);
    assert.match(css, /\.ad-nav-copy strong\s*\{[^}]*font-size:\s*13px;/s);
    assert.ok(css.includes("/* High-readability scale: prioritize legibility over compact density. */"));
    assert.match(readability, /\.ad-table td,[\s\S]{0,500}font-size:\s*16px;/);
});