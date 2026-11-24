"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ProductGrid } from "@/components/product/product-grid";
import { useLocalization } from "@/components/layout/localization-provider";
import { animalFilters, matchesAnimal } from "@/lib/product-animals";
import { sortProductsByDelivery } from "@/lib/product-shipping";
import type { Product } from "@/types/product";

type MakerSort = "featured" | "title-ascending" | "title-descending" | "price-ascending" | "price-descending" | "created-descending";

const sortOptions: Array<{ value: MakerSort; key: string; fallback: string }> = [
  { value: "featured", key: "shop.sort.featured", fallback: "Featured" },
  { value: "title-ascending", key: "shop.sort.title_ascending", fallback: "Name, A–Z" },
  { value: "title-descending", key: "shop.sort.title_descending", fallback: "Name, Z–A" },
  { value: "price-ascending", key: "shop.sort.price_ascending", fallback: "Price, low to high" },
  { value: "price-descending", key: "shop.sort.price_descending", fallback: "Price, high to low" },
  { value: "created-descending", key: "shop.sort.created_descending", fallback: "Newest" },
];

function categoryName(product: Product) {
  return product.productType?.trim() || product.categoryName.trim();
}

export function MakerProfileCollection({ products }: { products: Product[] }) {
  const { country, language, t } = useLocalization();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [animal, setAnimal] = useState("");
  const [sort, setSort] = useState<MakerSort>("featured");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const sortOptionsId = `maker-sort-options-${useId().replaceAll(":", "")}`;

  useEffect(() => {
    if (!isSortOpen) return;
    sortMenuRef.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')?.focus({ preventScroll: true });
    function dismissOutside(event: Event) {
      if (event.target instanceof Node && !sortMenuRef.current?.contains(event.target)) setIsSortOpen(false);
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [isSortOpen]);

  const categories = useMemo(() => [...new Set(products.map(categoryName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, language, { sensitivity: "base" })), [language, products]);
  const animals = useMemo(() => animalFilters
    .filter((filter) => filter.slug !== "all" && filter.slug !== "characters")
    .filter((filter) => products.some((product) => matchesAnimal(product, filter.tags))), [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(language);
    const filtered = products.filter((product) => {
      const matchesSearch = !query || [
        product.name,
        product.description,
        product.productType ?? "",
        product.categoryName,
        product.color ?? "",
        product.slug,
        ...(product.tags ?? []),
      ].join(" ").toLocaleLowerCase(language).includes(query);
      const matchesCategory = !category || categoryName(product) === category;
      const selectedAnimal = animals.find((filter) => filter.slug === animal);
      return matchesSearch && matchesCategory && (!selectedAnimal || matchesAnimal(product, selectedAnimal.tags));
    });

    return filtered.sort((a, b) => {
      if (sort === "title-ascending") return a.name.localeCompare(b.name, language, { sensitivity: "base" });
      if (sort === "title-descending") return b.name.localeCompare(a.name, language, { sensitivity: "base" });
      if (sort === "price-ascending") return a.priceAmount - b.priceAmount;
      if (sort === "price-descending") return b.priceAmount - a.priceAmount;
      if (sort === "created-descending") {
        const publishedDifference = Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "");
        return (Number(b.isNew) - Number(a.isNew)) || (Number.isNaN(publishedDifference) ? 0 : publishedDifference);
      }
      return 0;
    });
  }, [animal, animals, category, language, products, search, sort]);

  const sortedProducts = sort === "featured"
    ? sortProductsByDelivery(filteredProducts, country)
    : filteredProducts;

  const activeFilterCount = Number(Boolean(search.trim())) + Number(Boolean(category)) + Number(Boolean(animal));
  const selectedSortOption = sortOptions.find((item) => item.value === sort) ?? sortOptions[0];
  const selectedSortLabel = t(selectedSortOption.key, selectedSortOption.fallback);
  const focusSortTrigger = () => sortMenuRef.current?.querySelector<HTMLButtonElement>(".maker-profile-sort-trigger")?.focus({ preventScroll: true });
  const chooseSort = (value: MakerSort) => {
    setSort(value);
    setIsSortOpen(false);
    focusSortTrigger();
  };
  const handleSortKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && isSortOpen) {
      event.preventDefault();
      setIsSortOpen(false);
      focusSortTrigger();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!isSortOpen) {
      setIsSortOpen(true);
      return;
    }
    const options = Array.from(sortMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!options.length) return;
    const currentIndex = options.findIndex((option) => option === document.activeElement);
    const lastIndex = options.length - 1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % options.length
          : currentIndex <= 0 ? lastIndex : currentIndex - 1;
    options[nextIndex]?.focus({ preventScroll: true });
  };
  const clearFilters = () => {
    setSearch("");
    setCategory("");
    setAnimal("");
  };

  return (
    <section className="maker-profile-collection store-container" aria-labelledby="maker-collection-title">
      <header>
        <div>
          <p className="eyebrow">{t("maker.profile.collection.eyebrow", "FOUND ON PONYO")}</p>
          <h2 id="maker-collection-title">{t("maker.profile.collection.title", "Their collection")}</h2>
        </div>
        <span>{products.length} {t(products.length === 1 ? "maker.profile.collection.piece_one" : "maker.profile.collection.piece_other", products.length === 1 ? "piece" : "pieces")}</span>
      </header>

      <div className="maker-profile-collection-tools">
        <div className="maker-profile-collection-toolbar">
          <button
            type="button"
            ref={filterToggleRef}
            className="maker-profile-filter-toggle"
            aria-expanded={isOpen}
            aria-controls="maker-profile-filters"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span aria-hidden="true">☷</span>
            {t("maker.profile.collection.filter_button", "Filter & search")}
            {activeFilterCount > 0 && <span className="maker-profile-filter-count">{activeFilterCount}</span>}
          </button>
          <div className="maker-profile-sort">
            <span>{t("shop.sort.label", "Sort by")}</span>
            <div ref={sortMenuRef} className={`maker-profile-sort-menu${isSortOpen ? " is-open" : ""}`} onKeyDown={handleSortKeyDown}>
              <button
                type="button"
                className="maker-profile-sort-trigger"
                aria-label={t("shop.sort.current", "Sort by, currently {{label}}", { label: selectedSortLabel })}
                aria-haspopup="listbox"
                aria-expanded={isSortOpen}
                aria-controls={sortOptionsId}
                onClick={() => setIsSortOpen((open) => !open)}
              >
                <span>{selectedSortLabel}</span>
                <svg className="maker-profile-sort-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {isSortOpen && <div id={sortOptionsId} className="maker-profile-sort-options" role="listbox" aria-label={t("shop.sort.options_aria", "Sort products")}>
                {sortOptions.map((option) => (
                  <button key={option.value} type="button" role="option" aria-selected={option.value === sort} onClick={() => chooseSort(option.value)}>
                    <span>{t(option.key, option.fallback)}</span><span className="maker-profile-sort-check" aria-hidden="true">✓</span>
                  </button>
                ))}
              </div>}
            </div>
          </div>
        </div>

        <div className="maker-profile-filter-panel" id="maker-profile-filters" hidden={!isOpen} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
            filterToggleRef.current?.focus({ preventScroll: true });
          }
        }}>
          <label className="maker-profile-search">
            <span>{t("maker.profile.collection.search_label", "Search this collection")}</span>
            <span className="maker-profile-search-field">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("maker.profile.collection.search_placeholder", "Try “bunny”, “cushion” or a color")}
              />
            </span>
          </label>

          <div className="maker-profile-filter-groups">
            <fieldset className="maker-profile-filter-group">
              <legend>{t("maker.profile.collection.category_label", "Category")}</legend>
              <div className="maker-profile-filter-options">
                <button type="button" aria-pressed={!category} className={!category ? "is-active" : ""} onClick={() => setCategory("")}>
                  {t("maker.profile.collection.all_categories", "All categories")} <span>{products.length}</span>
                </button>
                {categories.map((item) => {
                  const count = products.filter((product) => categoryName(product) === item).length;
                  return <button key={item} type="button" aria-pressed={category === item} className={category === item ? "is-active" : ""} onClick={() => setCategory(category === item ? "" : item)}>{item}<span>{count}</span></button>;
                })}
              </div>
            </fieldset>

            {animals.length > 0 && <fieldset className="maker-profile-filter-group">
              <legend>{t("maker.profile.collection.animal_label", "Animal")}</legend>
              <div className="maker-profile-filter-options">
                <button type="button" aria-pressed={!animal} className={!animal ? "is-active" : ""} onClick={() => setAnimal("")}>
                  {t("maker.profile.collection.all_animals", "All animals")} <span>{products.length}</span>
                </button>
                {animals.map((item) => {
                  const count = products.filter((product) => matchesAnimal(product, item.tags)).length;
                  return <button key={item.slug} type="button" aria-pressed={animal === item.slug} className={animal === item.slug ? "is-active" : ""} onClick={() => setAnimal(animal === item.slug ? "" : item.slug)}>{t(item.key, item.name)}<span>{count}</span></button>;
                })}
              </div>
            </fieldset>}
          </div>

          <div className="maker-profile-filter-footer">
            <span>{t("maker.profile.collection.results", "Showing {{count}} of {{total}} pieces", { count: filteredProducts.length, total: products.length })}</span>
            <button type="button" onClick={clearFilters} disabled={activeFilterCount === 0}>{t("maker.profile.collection.clear_filters", "Clear filters")}</button>
          </div>
        </div>
      </div>

      {sortedProducts.length > 0
        ? <ProductGrid
          products={sortedProducts}
          preserveOrder
          className="maker-profile-product-grid"
        />
        : <div className="maker-profile-no-results" role="status">
          <span aria-hidden="true">✦</span>
          <h3>{t("maker.profile.collection.no_results_title", "No plush found just yet")}</h3>
          <p>{t("maker.profile.collection.no_results", "Try another search or clear your filters to see every piece.")}</p>
          <button type="button" onClick={clearFilters}>{t("maker.profile.collection.clear_filters", "Clear filters")}</button>
        </div>}
    </section>
  );
}
