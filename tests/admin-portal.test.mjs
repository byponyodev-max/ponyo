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
const rootLayout = read("../src/app/layout.tsx");
const localeRequest = read("../src/i18n/request.ts");
const localizationProvider = read("../src/components/layout/localization-provider.tsx");
const preferencesRoute = read("../src/app/api/preferences/route.ts");
const adminTranslations = read("../src/locales/admin-ui-translations.ts");

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

test("admin tables are readable, collapsible and automatically refresh the active section", () => {
    assert.ok(page.includes("setInterval(refreshWhenActive, 15000)"));
    assert.ok(page.includes('addEventListener("visibilitychange", refreshWhenActive)'));
    assert.ok(page.includes('className="ad-live-indicator"'));
    assert.ok(page.includes("AdminTablePagination"));
    assert.ok(page.includes("AdminTableCollapseButton"));
    assert.ok(css.includes(".ad-table tbody tr:nth-child(even) td"));
    assert.ok(css.includes(".ad-table-wrap"));
});

test("product workspace explains current database intake and supplier limitations", () => {
    assert.ok(page.includes("catalog_intake_title"));
    assert.ok(page.includes("catalog_intake_note"));
    assert.ok(adminTranslations.includes('"admin.ui.catalog_intake_note"'));
});

test("admin email inbox supports mailbox sync, queued replies and editable templates", () => {
    assert.ok(page.includes('id: "email-inbox"'));
    assert.ok(page.includes("emailReplyTemplates"));
    assert.ok(page.includes("aria-pressed={emailThreadKey === thread.threadKey}"));
    assert.ok(page.includes("syncEmailInbox"));
    assert.ok(page.includes("sendEmailReply"));
    assert.ok(api.includes('"/admin/email/inbox/status"'));
    assert.ok(api.includes('"/admin/email/inbox/sync"'));
    assert.ok(api.includes("/admin/email/inbox/${encodeURIComponent(threadKey)}/reply"));
    assert.ok(backend.includes('"/email/inbox/{thread_key}/reply"'));
    assert.ok(backend.includes('require_roles("admin")'));
    assert.ok(adminTranslations.includes('"admin.ui.email_imap_setup"'));
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

test("admin language can be changed in both login and dashboard and defaults to English", () => {
    assert.equal((page.match(/<AdminLanguageSelect /g) || []).length, 2);
    assert.ok(page.includes('value="en">English'));
    assert.ok(page.includes('value="ja">日本語'));
    assert.ok(page.includes('value="ko">한국어'));
    assert.ok(proxy.includes('"x-ponyo-admin-portal"'));
    assert.ok(rootLayout.includes('isAdminPortal ? "ponyo-admin-language" : "ponyo-language"'));
    assert.ok(rootLayout.includes('isAdminPortal ? "en" : countryLocalization.language'));
    assert.ok(localeRequest.includes('isAdminPortal ? "ponyo-admin-language" : "ponyo-language"'));
    assert.ok(localeRequest.includes('(isAdminPortal ? "en" : getDeliveryLocalization(country).language)'));
    assert.ok(localizationProvider.includes('adminPortal ? { adminLanguage: next } : { language: next }'));
    assert.ok(preferencesRoute.includes('cookieStore.set("ponyo-admin-language", adminLanguage, options)'));
    assert.ok(adminTranslations.includes('"admin.ui.language", "Language", "言語", "언어"'));
});