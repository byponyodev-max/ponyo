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
const newsletterUnsubscribePage = read("../src/app/newsletter/unsubscribe/page.tsx");
const newsletterUnsubscribeForm = read("../src/app/newsletter/unsubscribe/newsletter-unsubscribe-form.tsx");
const emailQueue = read("../backend/app/email_queue.py");
const supplierNotificationMigration = read("../backend/migrations/versions/20261120_0031_supplier_created_at.py");

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
    assert.ok(page.includes("setEmailThreadArchived"));
    assert.ok(page.includes('key: "archived"'));
    assert.ok(api.includes('"/admin/email/inbox/status"'));
    assert.ok(api.includes('"/admin/email/inbox/sync"'));
    assert.ok(api.includes("/admin/email/inbox/${encodeURIComponent(threadKey)}/reply"));
    assert.ok(api.includes("/admin/email/inbox/${encodeURIComponent(threadKey)}/archive"));
    assert.ok(backend.includes('"/email/inbox/{thread_key}/reply"'));
    assert.ok(backend.includes('"/email/inbox/{thread_key}/archive"'));
    assert.ok(backend.includes('require_roles("admin")'));
    assert.ok(adminTranslations.includes('"admin.ui.email_imap_setup"'));
    assert.ok(adminTranslations.includes('"admin.ui.email_archive_note"'));
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

test("admin dates and dashboard greetings use Japan time", () => {
    assert.ok(page.includes('const adminTimeZone = "Asia/Tokyo"'));
    assert.ok(page.includes('dateStyle: "medium", timeZone: adminTimeZone'));
    assert.ok(page.includes('month: "short", day: "numeric", timeZone: adminTimeZone'));
    assert.ok(page.includes('hourCycle: "h23"'));
    assert.ok(page.includes('hour < 12 ? "good_morning" : hour < 18 ? "good_afternoon" : "good_evening"'));
    assert.ok(adminTranslations.includes('"admin.ui.good_afternoon"'));
    assert.ok(adminTranslations.includes('"admin.ui.good_evening"'));
});

test("admin portal exposes a searchable, paginated newsletter subscriber list", () => {
    assert.ok(page.includes('label: "Newsletter"'));
    assert.ok(page.includes('section === "newsletter"'));
    assert.ok(page.includes("listAdminNewsletterSubscriptions"));
    assert.ok(api.includes("/admin/newsletter/subscriptions"));
    assert.ok(backend.includes('"/newsletter/subscriptions"'));
    assert.ok(adminTranslations.includes('"admin.ui.newsletter_title"'));
});

test("admin can queue newsletter campaigns with opt-out links", () => {
    assert.ok(page.includes("newsletter_campaign_confirm_count"));
    assert.ok(page.includes("sendAdminNewsletterCampaign"));
    assert.ok(api.includes('"/admin/newsletter/campaigns"'));
    assert.ok(backend.includes('"/newsletter/campaigns"'));
    assert.ok(emailQueue.includes('if template == "newsletter_campaign"'));
    assert.ok(emailQueue.includes("unsubscribeUrl"));
    assert.ok(newsletterUnsubscribePage.includes("searchParams: Promise"));
    assert.ok(newsletterUnsubscribeForm.includes("ponyoApi.unsubscribeNewsletter(token)"));
    assert.ok(newsletterUnsubscribeForm.includes("<form onSubmit="));
});

test("dashboard shows live operational notifications with links to relevant sections", () => {
    assert.ok(page.includes('className="ad-panel ad-notification-panel"'));
    assert.ok(page.includes("notification_unread_emails"));
    assert.ok(page.includes("notification_products"));
    assert.ok(page.includes("notification_suppliers"));
    assert.ok(page.includes("notification_waitlist"));
    assert.ok(api.includes("unreadEmailThreads: number"));
    assert.ok(backend.includes('"notifications": {'));
    assert.ok(supplierNotificationMigration.includes('revision = "20261120_0031"'));
});