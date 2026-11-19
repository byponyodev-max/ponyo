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

test("admin shows reservation and interest country reports separately", () => {
  assert.ok(adminPage.includes("aggregateReservationsByCountry(reservationProducts)"));
  assert.ok(adminPage.includes("Reservations by country"));
  assert.ok(adminPage.includes("aggregateReservationsByCountry(\n\t\tinterestProducts.map"));
  assert.ok(adminPage.includes("Interests by country"));
  assert.ok(adminPage.includes("BY COUNTRY"));
  assert.ok(adminPage.includes("reservationProducts.map"));
  assert.ok(adminPage.includes("interestProducts.map((product) => <tr key={product.id}"));
});

test("available destinations reserve while other destinations register separate interest", () => {
  assert.match(productPurchasePanel, /shippingStatus === "deliverable"[\s\S]*product\.reservationsOpen[\s\S]*href="#product-reservation"[\s\S]*href="#product-interest"/);
  assert.match(productCommunity, /shippingStatus === "deliverable"[\s\S]*<ProductReservationPanel[\s\S]*<ProductInterestPanel/);
  assert.match(apiClient, /submitProductReservation:[\s\S]*\/products\/\$\{encodeURIComponent\(productId\)\}\/reservations/);
  assert.match(apiClient, /submitProductInterest:[\s\S]*\/products\/\$\{encodeURIComponent\(productId\)\}\/interests/);
  assert.match(productCommunity, /product\.reservation\.title", "Reserve a spot"/);
  assert.match(productCommunity, /product\.interest\.body",[\s\S]*separate from reserving an available item/);
});
