import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SiteFrame } from "@/components/layout/site-frame";
import { ProductGrid } from "@/components/product/product-grid";
import { SortSelect } from "@/components/product/sort-select";
import { CatalogFilterPanel } from "@/components/product/catalog-filter-panel";
import { getLocalizedProducts, getProductCategories } from "@/services/localized-products.server";
import { isDominaXLProduct, orderProductCategories, productCategoryTranslationKey } from "@/lib/product-categories";
import { parsePriceFilter } from "@/lib/price-filter";
import type { Product } from "@/types/product";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("shop.metadata.title"),
    description: t("shop.metadata.description"),
  };
}

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const legacyCollections = [
  { title: "Bears", key: "bears", slug: "bears" }, { title: "Bunnies", key: "bunnies", slug: "bunnies" },
  { title: "Cats", key: "cats", slug: "cats" }, { title: "Cute Characters", key: "characters", slug: "characters" },
  { title: "New Arrivals", key: "new_arrivals", slug: "new-arrivals" }, { title: "Pandas", key: "pandas", slug: "pandas" },
  { title: "Penguins", key: "penguins", slug: "penguins" },
  { title: "Puppies", key: "puppies", slug: "puppies" },
  { title: "Trending", key: "trending", slug: "trending" },
];
const categoryKeys: Record<string, string> = {
  premium: "premium", "domina-xl": "xl", "giant-plush": "xl",
  "new-arrival": "new_arrivals", "new-arrivals": "new_arrivals",
  bears: "bears", bunnies: "bunnies", cats: "cats", characters: "characters",
  pandas: "pandas", penguins: "penguins", puppies: "puppies", trending: "trending",
};
const trendingHandles = new Set(["cherry-blossom-bunny", "mint-dino", "hoshi-cloud-bear", "better-days-panda", "bluebell-penguin", "haneul-bunny", "cloud-cat", "biscuit-bow-pup"]);

function matchesLegacyCollection(tags: string[] = [], type = "", category = "", slug = "") {
  const key = category.toLowerCase().replaceAll("_", "-");
  if (key === "trending") return trendingHandles.has(slug);
  const aliases: Record<string, string> = {
    premium: "premium", "domina-xl": "domina-xl", "giant-plush": "domina-xl",
    "new-arrival": "new-arrival", "new-arrivals": "new-arrival", bears: "bear", bunnies: "bunny", cats: "cat",
    pandas: "panda", puppies: "puppy", penguins: "penguin", characters: "character", "cute-characters": "character",
    collectibles: "collectible",
  };
  if (!key || key === "all") return true;
  const tag = aliases[key] ?? key;
  return tags.some((item) => item.toLowerCase() === tag) || type.toLowerCase() === tag;
}

function matchesCategory(product: Product, category: string, categories: Awaited<ReturnType<typeof getProductCategories>>) {
  const selected = categories.find((item) => item.slug === category);
  if (!selected) return matchesLegacyCollection(product.tags, product.productType, category, product.slug);
  const productCategory = categories.find((item) => item.id === product.categoryId || item.slug === product.categorySlug);
  const categoryMatches = productCategory?.id === selected.id || productCategory?.parentId === selected.id;
  if (categoryMatches) return true;
  if (category === "oversized") {
    return isDominaXLProduct(product);
  }
  if (category === "giant-plush") {
    return isDominaXLProduct(product);
  }
  return false;
}

const collectionImages: Record<string, string> = {
  all: "/images/catalog/mallow-floor-sofa.png",
  "plush-toys": "/images/catalog/ponyo-6.png",
  "collectible-plush": "/images/catalog/maker-bear.jpg",
  "character-plush": "/images/catalog/moon-jelly-plush.webp",
  oversized: "/images/categories/oversized.png",
  "giant-plush": "/images/catalog/ponyo-11.png",
  "oversized-soft-objects": "/images/catalog/ponyo-round-cat-seat.webp",
  cushions: "/images/categories/cushions.png",
  "designer-cushions": "/images/catalog/sunbeam-daisy-cushion.webp",
  "character-pillows": "/images/catalog/cloud-hug-cushion.webp",
  "soft-furniture": "/images/categories/soft-furniture.png",
  chairs: "/images/catalog/mallow-reading-chair.webp",
  beds: "/images/catalog/moon-cloud-throw.webp",
  seating: "/images/catalog/seashell-floor-cushion.webp",
  "wall-decor": "/images/categories/wall-decor.png",
  "domina-xl": "/images/catalog/ponyo-12.png",
  "new-arrivals": "/images/home-hero/ponyo-hero-dream-room.webp",
  "new-arrival": "/images/catalog/strawberry-mushroom-plush.webp",
  premium: "/images/catalog/toasty-teddy-plush.webp",
  rare: "/images/catalog/ponyo-7.png",
  "rare-finds": "/images/catalog/ponyo-7.png",
  collectibles: "/images/catalog/ponyo-12.png",
  characters: "/images/catalog/tidepool-octopus-plush.webp",
};

function collectionImage(category: string) {
  return collectionImages[category] ?? collectionImages.all;
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<Query> }) {
  const t = await getTranslations();
  const query = await searchParams;
  const requestedCategory = first(query.category) ?? first(query.collection) ?? "";
  const category = requestedCategory;
  const search = (first(query.q) ?? "").trim();
  const minimum = parsePriceFilter(query.min ?? query["filter.v.price.gte"], 0);
  const maximum = parsePriceFilter(query.max ?? query["filter.v.price.lte"], Number.POSITIVE_INFINITY);
  const size = first(query.size) ?? first(query["filter.p.m.ponyo.size_tier"]) ?? "";
  const availability = first(query["filter.v.availability"]) ?? "";
  const sort = first(query.sort_by) ?? "best-selling";
  const productQuery = search ? new URLSearchParams({ q: search, limit: "100" }).toString() : "";
  const localizedSize = (value: string) => {
    const key = value.toLowerCase();
    return ["small", "medium", "large", "xl"].includes(key) ? t(`shop.size.${key}`) : value;
  };
  const [products, categoryData] = await Promise.all([getLocalizedProducts(productQuery), getProductCategories()]);
  const categories = orderProductCategories(categoryData);
  const rootCategories = categories.filter((item) => !item.parentId);
  const filtered = products.filter((product) => {
    const haystack = `${product.name} ${product.description} ${product.productType ?? ""} ${(product.tags ?? []).join(" ")}`.toLowerCase();
    const productSize = (product.sizeTier ?? product.size ?? "").toLowerCase();
    const sizeMatches = !size || (size.toLowerCase() === "xl"
      ? product.tags?.includes("domina-xl") || productSize === "xl"
      : productSize.startsWith(size.toLowerCase()));
    return matchesCategory(product, category, categories)
      && (!search || haystack.includes(search.toLowerCase()))
      && product.priceAmount >= minimum && product.priceAmount <= maximum
      && sizeMatches && (!availability || availability !== "1" || product.availability === "available");
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "featured" || sort === "best-selling") {
      const rank = (product: typeof a) => trendingHandles.has(product.slug) ? 0 : product.tags?.includes("new-arrival") ? 1 : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    }
    if (sort === "relevance" && search) {
      const rank = (product: typeof a) => product.name.toLowerCase().startsWith(search.toLowerCase()) ? 0 : product.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 2;
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    }
    if (sort === "price-ascending") return a.priceAmount - b.priceAmount;
    if (sort === "price-descending") return b.priceAmount - a.priceAmount;
    if (sort === "title-descending") return b.name.localeCompare(a.name);
    if (sort === "created-descending") return Number((b.tags ?? []).includes("new-arrival")) - Number((a.tags ?? []).includes("new-arrival"));
    if (sort === "created-ascending") return Number((a.tags ?? []).includes("new-arrival")) - Number((b.tags ?? []).includes("new-arrival"));
    return a.name.localeCompare(b.name);
  });
  const selectedCategory = categories.find((item) => item.slug === category);
  const categoryKey = categoryKeys[category];
  const heading = search
    ? t("shop.heading.search", { query: search })
    : selectedCategory
      ? (t.has(productCategoryTranslationKey(selectedCategory.slug))
        ? t(productCategoryTranslationKey(selectedCategory.slug))
        : selectedCategory.name)
      : categoryKey
      ? t(`shop.category.${categoryKey}`)
      : category
        ? category.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
        : t("shop.heading.all");
  const description = category === "premium"
    ? t("shop.description.premium")
    : t("shop.description.default");
  const filterUrl = (removedKeys: string[] = []) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (removedKeys.includes(key) || key === "page") continue;
      const entry = first(value);
      if (entry !== undefined) params.set(key, entry);
    }
    const suffix = params.toString();
    return `/collections/all${suffix ? `?${suffix}` : ""}`;
  };
  const clearFiltersUrl = filterUrl(["size", "filter.p.m.ponyo.size_tier", "filter.v.availability", "min", "max", "filter.v.price.gte", "filter.v.price.lte"]);
  const preservedQuery = Object.fromEntries(Object.entries(query).flatMap(([key, value]) => {
    if (["category", "collection", "size", "filter.p.m.ponyo.size_tier", "filter.v.availability", "min", "max", "filter.v.price.gte", "filter.v.price.lte", "sort_by", "page"].includes(key)) return [];
    const entry = first(value);
    return entry === undefined ? [] : [[key, entry]];
  }));
  const activeFilters = [
    ...(size ? [{ label: t("shop.filter.size_value", { size: localizedSize(size) }), remove: filterUrl(["size", "filter.p.m.ponyo.size_tier"]) }] : []),
    ...(availability ? [{ label: t("shop.filter.in_stock"), remove: filterUrl(["filter.v.availability"]) }] : []),
    ...(minimum ? [{ label: t("shop.filter.price_from", { amount: `¥${minimum.toLocaleString("en-US")}` }), remove: filterUrl(["min", "filter.v.price.gte"]) }] : []),
    ...(Number.isFinite(maximum) ? [{ label: t("shop.filter.price_to", { amount: `¥${maximum.toLocaleString("en-US")}` }), remove: filterUrl(["max", "filter.v.price.lte"]) }] : []),
  ];
  const categoryLabel = (item: (typeof categories)[number]) => {
    const key = productCategoryTranslationKey(item.slug);
    return t.has(key) ? t(key) : item.name;
  };
  const categoryCount = (item: (typeof categories)[number]) =>
    products.filter((product) => matchesCategory(product, item.slug, categories)).length;
  const filterCategories = categories.map((item) => {
    const parent = categories.find((candidate) => candidate.id === item.parentId);
    return {
      title: categoryLabel(item),
      key: item.slug.replaceAll("-", "_"),
      slug: item.slug,
      parentTitle: parent ? categoryLabel(parent) : undefined,
    };
  });
  const legacyCollectionLabel = (item: (typeof legacyCollections)[number]) => t(`shop.category.${item.key}`);
  const legacyCollectionCount = (item: (typeof legacyCollections)[number]) =>
    products.filter((product) => matchesLegacyCollection(product.tags, product.productType, item.slug, product.slug)).length;

  return (
    <SiteFrame className="store-page collection-page">
      <header className={`collection-heading collection-tone-${category || "all"}`}>
        <div className="collection-heading-copy">
          <span className="collection-heading-eyebrow"><span aria-hidden="true">✦</span>PONYO · {t("home.footer.explore")}</span>
          <h1>{heading}</h1>
          <p>{description}</p>
          <div className="collection-size-chips"><span>{t("shop.count.plush", { count: sorted.length })}</span>{["Small", "Medium", "Large", "XL"].map((tier) => <Link key={tier} href={`/shop?${new URLSearchParams({ ...(category ? { category } : {}), size: tier }).toString()}`} className={size === tier ? "is-selected" : ""}>{localizedSize(tier)}</Link>)}</div>
        </div><div className="collection-heading-image"><Image src={collectionImage(category)} alt="" fill sizes="(max-width: 700px) 100vw, 45vw" priority /><span className="collection-heading-image-stamp" aria-hidden="true"><span>✦</span><strong>PONYO</strong><small>{t("home.footer.explore")}</small></span></div>
      </header>
      <nav className="collection-mobile-chips" aria-label={t("shop.filter.categories_aria")}><Link href="/collections/all" aria-current={!category ? "page" : undefined}>{t("shop.category.all")}<small aria-label={t("shop.count.category", { count: products.length })}>{products.length}</small></Link>{rootCategories.map((item) => {
        const count = categoryCount(item);
        return <Link key={item.slug} href={`/collections/${item.slug}`} aria-current={category === item.slug ? "page" : undefined}>{categoryLabel(item)}<small aria-label={t("shop.count.category", { count })}>{count}</small></Link>;
      })}</nav>
      <nav className="collection-mobile-chips collection-mobile-legacy-chips" aria-label={t("shop.filter.more_ways")}>
        {legacyCollections.map((item) => <Link key={item.slug} href={`/collections/${item.slug}`} aria-current={category === item.slug ? "page" : undefined}>
          {legacyCollectionLabel(item)}<small aria-label={t("shop.count.category", { count: legacyCollectionCount(item) })}>{legacyCollectionCount(item)}</small>
        </Link>)}
      </nav>
      <div className="collection-layout">
        <aside className="collection-sidebar">
          <details className="collection-sidebar-details" open>
            <summary>{t("shop.filter.category")}</summary>
            <div className="collection-sidebar-content">
              <nav aria-label={t("shop.filter.product_categories_aria")}>
                <Link href="/collections/all" className={!category ? "is-selected" : ""}><span>{t("shop.category.all")}</span><b aria-label={t("shop.count.category", { count: products.length })}>{products.length}</b></Link>
                {rootCategories.map((parent) => <div className="collection-category-group" key={parent.id}>
                  <Link href={`/collections/${parent.slug}`} className={category === parent.slug ? "is-selected" : ""}>
                    <span>{categoryLabel(parent)}</span><b aria-label={t("shop.count.category", { count: categoryCount(parent) })}>{categoryCount(parent)}</b>
                  </Link>
                  {categories.filter((item) => item.parentId === parent.id).map((child) => <Link key={child.id} href={`/collections/${child.slug}`} className={`collection-category-child${category === child.slug ? " is-selected" : ""}`}>
                    <span>{categoryLabel(child)}</span><b aria-label={t("shop.count.category", { count: categoryCount(child) })}>{categoryCount(child)}</b>
                  </Link>)}
                </div>)}
              </nav>
              <details className="sidebar-filter collection-legacy-filter"><summary>{t("shop.filter.more_ways")}</summary><div>
                {legacyCollections.map((item) => <Link key={item.slug} href={`/collections/${item.slug}`} className={category === item.slug ? "is-selected" : ""}>
                  {legacyCollectionLabel(item)} <b>{legacyCollectionCount(item)}</b>
                </Link>)}
              </div></details>
              <details className="sidebar-filter" open><summary>{t("shop.filter.availability")}</summary><Link href={`/shop?${new URLSearchParams({ ...(category ? { category } : {}), ...(size ? { size } : {}), ...(minimum ? { min: String(minimum) } : {}), ...(Number.isFinite(maximum) ? { max: String(maximum) } : {}), ...(sort !== "best-selling" ? { sort_by: sort } : {}), "filter.v.availability": "1" }).toString()}`} className={availability === "1" ? "is-selected" : ""}>{t("shop.filter.in_stock")} <b>{products.filter((product) => product.availability === "available").length}</b></Link></details>
              <details className="sidebar-filter" open><summary>{t("shop.filter.price")}</summary><form action="/shop" method="get">{category && <input type="hidden" name="category" value={category} />}{search && <input type="hidden" name="q" value={search} />}{size && <input type="hidden" name="size" value={size} />}{availability && <input type="hidden" name="filter.v.availability" value={availability} />}{sort !== "best-selling" && <input type="hidden" name="sort_by" value={sort} />}<label>¥ <input type="number" name="min" min="0" defaultValue={minimum || ""} placeholder={t("shop.filter.from")} /></label><span>{t("shop.filter.to_connector")}</span><label>¥ <input type="number" name="max" min="0" defaultValue={Number.isFinite(maximum) ? maximum : ""} placeholder={t("shop.filter.no_limit")} /></label><button type="submit" aria-label={t("shop.filter.apply_price")}>›</button></form></details>
            </div>
          </details>
        </aside>
        <section className="collection-products" aria-label={t("shop.filter.products_aria")}>
          <div className="collection-toolbar">
            <CatalogFilterPanel categories={filterCategories} category={category} size={size} minimum={minimum} maximum={maximum} availability={availability} preservedQuery={preservedQuery} clearHref={clearFiltersUrl} />
            <span className="collection-count">{t("shop.count.products", { count: sorted.length })}</span>
            <SortSelect value={sort} category={category} search={search} preservedFilters={{ ...(minimum ? { min: String(minimum) } : {}), ...(Number.isFinite(maximum) ? { max: String(maximum) } : {}), ...(size ? { size } : {}), ...(availability ? { "filter.v.availability": availability } : {}) }} />
          </div>
          {activeFilters.length > 0 && <div className="active-filter-chips" aria-label={t("shop.filter.active_aria")}>{activeFilters.map((filter) => <Link href={filter.remove} key={filter.label} aria-label={t("shop.filter.remove", { label: filter.label })}>{filter.label}<span aria-hidden="true">×</span></Link>)}<Link href={clearFiltersUrl} className="clear-all-filters">{t("shop.filter.clear_all")}</Link></div>}
          <p className="mobile-product-count">{t("shop.count.products", { count: sorted.length })}</p>
          <ProductGrid products={sorted} fillSlots />
          {sorted.length === 0 && <div className="empty-collection"><strong>{t("shop.empty.title")}</strong><p>{t("shop.empty.description")}</p><Link className="shop-button shop-button-orange" href="/shop">{t("shop.empty.cta")}</Link></div>}
        </section>
      </div>
    </SiteFrame>
  );
}
