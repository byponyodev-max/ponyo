import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/admin-reservation-report.ts", import.meta.url), "utf8");
const adminPage = readFileSync(new URL("../src/app/admin-portal/page.tsx", import.meta.url), "utf8");
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

test("admin reservations panel renders country totals alongside product reporting", () => {
  assert.ok(adminPage.includes("aggregateReservationsByCountry(reservationProducts)"));
  assert.ok(adminPage.includes("Reservations by country"));
  assert.ok(adminPage.includes("BY COUNTRY"));
  assert.ok(adminPage.includes("reservationProducts.map"));
});
