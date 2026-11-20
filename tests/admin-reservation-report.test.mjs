import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/admin-reservation-report.ts", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../src/app/admin-portal/page.tsx", import.meta.url), "utf8");
const productPurchasePanel = readFileSync(new URL("../src/components/product/product-purchase-panel.tsx", import.meta.url), "utf8");
const productCommunity = readFileSync(new URL("../src/components/product/product-community.tsx", import.meta.url), "utf8");
const apiClient = readFileSync(new URL("../src/services/ponyo-api.client.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const context = { exports: {} };
vm.runInNewContext(outputText, context);

test("admin country totals combine products and sort by reservations", () => {
  const totals = context.exports.aggregateReservationsByCountry([
    { reservationsByCountry: [{ country: "JP", count: 4 }, { country: "KR", count: 2 }] },
    { reservationsByCountry: [{ country: "KR", count: 3 }, { country: "US", count: 1 }] },
    {},
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(totals)), [
    { country: "KR", count: 5 },
    { country: "JP", count: 4 },
    { country: "US", count: 1 },
  ]);
});

test("demand reports sort by count and filter by product or country", () => {
  const products = [
    { id: "a", name: "Alpha", sku: "A-1", reservationCount: 2, interestCount: 8, reservationsByCountry: [{ country: "JP", count: 2 }], interestsByCountry: [{ country: "JP", count: 8 }] },
    { id: "b", name: "Beta", sku: "B-1", reservationCount: 6, interestCount: 3, reservationsByCountry: [{ country: "KR", count: 6 }], interestsByCountry: [{ country: "KR", count: 3 }] },
    { id: "c", name: "Gamma", sku: "C-1", reservationCount: 1, interestCount: 1, reservationsByCountry: [], interestsByCountry: [] },
  ];
  assert.deepEqual(
    context.exports.filterAndSortDemandProducts(products, "reservations", "", "", "most").map((product) => product.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    context.exports.filterAndSortDemandProducts(products, "interests", "a-", "JP", "least").map((product) => product.id),
    ["a"],
  );
});

test("admin shows reservation and interest country reports separately", () => {
  assert.ok(adminPage.includes('role="tablist"'));
  assert.ok(adminPage.includes('aria-controls="interest-report-panel"'));
  assert.ok(adminPage.includes('reservationTab === "reservations"'));
  assert.ok(adminPage.includes('reservationTab === "interests"'));
  assert.ok(adminPage.includes("Each row is one product; its country counts are shown beside that product."));
  assert.ok(adminPage.includes("Each row is one product; country counts stay with that product."));
  assert.ok(adminPage.includes("BY COUNTRY"));
  assert.ok(adminPage.includes("reservationProducts.map"));
  assert.ok(adminPage.includes('visibleRows(interestReportProducts, "interests").map((product) => <tr key={product.id}'));
  assert.ok(!adminPage.includes("Reservations by country across all products"));
  assert.ok(!adminPage.includes("Interests by country across all products"));
});

test("admin product rows expose each product's shipping confirmation state and rules", () => {
  const catalogEditor = readFileSync(new URL("../src/components/admin/catalog-editors.tsx", import.meta.url), "utf8");
  assert.ok(catalogEditor.includes("Shipping: {shippingStatus} · Manage"));
  assert.ok(catalogEditor.includes("Shipping destinations for this product"));
  assert.ok(catalogEditor.includes("I confirmed these destinations with the maker"));
  assert.ok(catalogEditor.includes("deliveryCountries.map((destination)"));
  assert.ok(catalogEditor.includes("Japan / South Korea"));
  assert.ok(catalogEditor.includes("Selected countries can reserve when reservations are open."));
  assert.ok(catalogEditor.includes("Unconfirmed means reservations are blocked for every country"));
});

test("available destinations reserve while other destinations register separate interest", () => {
  assert.match(productPurchasePanel, /shippingStatus === "deliverable"[\s\S]*product\.reservationsOpen[\s\S]*href="#product-reservation"[\s\S]*href="#product-interest"/);
  assert.match(productCommunity, /shippingStatus === "deliverable"[\s\S]*<ProductReservationPanel[\s\S]*<ProductInterestPanel/);
  assert.match(apiClient, /submitProductReservation:[\s\S]*\/products\/\$\{encodeURIComponent\(productId\)\}\/reservations/);
  assert.match(apiClient, /submitProductInterest:[\s\S]*\/products\/\$\{encodeURIComponent\(productId\)\}\/interests/);
  assert.match(productCommunity, /product\.reservation\.title", "Reserve a spot"/);
  assert.match(productCommunity, /product\.interest\.body",[\s\S]*separate from reserving an available item/);
});
