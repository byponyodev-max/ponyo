import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/price-filter.ts", import.meta.url), "utf8");
const context = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  context,
);

test("price filters ignore empty and invalid query values", () => {
  const { parsePriceFilter } = context.exports;

  assert.equal(parsePriceFilter("", 0), 0);
  assert.equal(parsePriceFilter("   ", Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  assert.equal(parsePriceFilter("not-a-price", Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  assert.equal(parsePriceFilter("3200", 0), 3200);
  assert.equal(parsePriceFilter(["4500", "9000"], 0), 4500);
});
