import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/services/ponyo-api.client.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function client(env, browser = false, responses = []) {
  const requests = [];
  const context = {
    exports: {},
    process: { env },
    Headers,
    URLSearchParams,
    ...(browser ? { window: {}, document: { cookie: "" } } : {}),
    fetch: async (url) => {
      requests.push(url);
      const payload = responses.length
        ? responses.shift()
        : { data: { csrfToken: "test-token" } };
      return { ok: true, json: async () => payload };
    },
  };
  vm.runInNewContext(outputText, context);
  return { api: context.exports.ponyoApi, requests };
}

test("SSR resolves development proxy to absolute backend URL", async () => {
  const { api, requests } = client({ NODE_ENV: "development", NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" });
  await api.listProducts("", "ja");
  assert.equal(requests[0], "http://127.0.0.1:8000/v1/products?locale=ja");
});

test("localized product listing and detail requests carry locale and preserve translated fields", async () => {
  const product = {
    id: "product-id",
    sku: "PNY-UNCHANGED",
    name: "ふわふわのうさぎ",
    description: "柔らかい綿のぬいぐるみ",
    categoryName: "うさぎ",
    productType: "ぬいぐるみ",
    materials: "綿とポリエステル",
    dimensions: "18 cm",
    dispatchTime: "3日以内に発送",
    imageAlt: "青いリボンをつけたクリーム色のうさぎ",
    images: [{ url: "/bunny.png", alt: "青いリボンをつけたクリーム色のうさぎ" }],
    galleryImages: [{ src: "/bunny.png", alt: "青いリボンをつけたクリーム色のうさぎ" }],
    makerName: "Mochi & Co.",
    makerStory: "小さな工房で丁寧に作られています。",
    variants: [{
      id: "variant-id",
      sku: "PNV-UNCHANGED",
      title: "標準サイズ",
      options: { "色": "クリーム" },
      priceAmount: 1800,
      currency: "JPY",
      availability: "available",
    }],
  };
  const { api, requests } = client(
    { NODE_ENV: "development", NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" },
    false,
    [{ data: [product], page: 1, limit: 24, total: 1 }, { data: product }],
  );

  const listing = await api.listProducts("", "ja");
  const detail = await api.getProduct(product.id, "ja");

  assert.deepEqual(requests, [
    "http://127.0.0.1:8000/v1/products?locale=ja",
    "http://127.0.0.1:8000/v1/products/product-id?locale=ja",
  ]);
  assert.equal(listing[0].materials, product.materials);
  assert.equal(listing[0].makerStory, product.makerStory);
  assert.equal(listing[0].variants[0].options["色"], "クリーム");
  assert.equal(detail.imageAlt, product.imageAlt);
  assert.equal(detail.sku, product.sku);
  assert.equal(detail.makerName, "Mochi & Co.");
});

test("SSR respects a private backend override", async () => {
  const { api, requests } = client({ NODE_ENV: "production", NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api", PONYO_API_SERVER_BASE_URL: "https://api.example.test/" });
  await api.listProducts();
  assert.equal(requests[0], "https://api.example.test/v1/products?locale=en");
});

test("browser retains same-origin proxy for CSRF and registration", async () => {
  const { api, requests } = client({ NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" }, true);
  await api.register({ email: "test@example.test", password: "test" });
  assert.deepEqual(requests, ["/ponyo-api/v1/auth/csrf", "/ponyo-api/v1/auth/register"]);
});

test("absolute public URL remains unchanged on server", async () => {
  const { api, requests } = client({ NEXT_PUBLIC_PONYO_API_BASE_URL: "https://api.example.test/" });
  await api.listProducts();
  assert.equal(requests[0], "https://api.example.test/v1/products?locale=en");
});

test("production relative URL requires explicit server configuration", async () => {
  const { api, requests } = client({ NODE_ENV: "production", NEXT_PUBLIC_PONYO_API_BASE_URL: "/ponyo-api" });
  await assert.rejects(api.listProducts(), /PONYO_API_SERVER_BASE_URL/);
  assert.equal(requests.length, 0);
});