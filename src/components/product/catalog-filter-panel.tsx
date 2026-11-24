"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import { PonyoSelect } from "@/components/ui/ponyo-select";

type CatalogFilterPanelProps = {
  categories: Array<{ title: string; key: string; slug: string; parentTitle?: string }>;
  category: string;
  size: string;
  minimum: number;
  maximum: number;
  availability: string;
  preservedQuery: Record<string, string>;
  clearHref: string;
};

export function CatalogFilterPanel({ categories, category, size, minimum, maximum, availability, preservedQuery, clearHref }: CatalogFilterPanelProps) {
  const { t } = useLocalization();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      const details = detailsRef.current;
      if (details && details.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, []);

  return (
    <details ref={detailsRef} className="all-filters" onToggle={(event) => {
      setIsOpen(event.currentTarget.open);
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus({ preventScroll: true });
      }
    }}>
      <summary aria-expanded={isOpen}>
        <span className="filter-summary-label"><span aria-hidden="true">☷</span> {t("shop.filter.filters", "Filters")}</span>
        <svg className="catalog-chevron filter-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="all-filters-panel">
        <form action="/shop" method="get" className="catalog-filter-form">
          {Object.entries(preservedQuery).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
          <h2>{t("shop.filter.refine", "Refine your finds")}</h2>
          <label htmlFor="catalog-category-filter">{t("shop.filter.category", "Category")}
            <PonyoSelect
              id="catalog-category-filter"
              name="category"
              defaultValue={category}
              label={t("shop.filter.category", "Category")}
              searchable={categories.length > 8}
              searchPlaceholder={t("general.search", "Search")}
              emptyMessage={t("localization.no_matches", "No matches yet. Try another search.")}
              options={[
                { value: "", label: t("shop.filter.all", "All plush") },
                ...categories.map((item) => ({
                  value: item.slug,
                  label: `${item.parentTitle ? `${item.parentTitle} · ` : ""}${t(`shop.category.${item.key}`, item.title)}`,
                })),
              ]}
            />
          </label>
          <label htmlFor="catalog-size-filter">{t("shop.filter.size", "Size")}
            <PonyoSelect
              id="catalog-size-filter"
              name="size"
              defaultValue={size}
              label={t("shop.filter.size", "Size")}
              options={[
                { value: "", label: t("shop.filter.any_size", "Any size") },
                ...[
                ["Small", "shop.size.small"],
                ["Medium", "shop.size.medium"],
                ["Large", "shop.size.large"],
                ["XL", "shop.size.xl"],
                ].map(([tier, key]) => ({ value: tier, label: t(key, tier) })),
              ]}
            />
          </label>
          <fieldset>
            <legend>{t("shop.filter.price_range", "Price range")}</legend>
            <div className="catalog-price-fields">
              <label>{t("shop.filter.from", "From")} ¥<input type="number" name="min" min="0" defaultValue={minimum || ""} placeholder="0" /></label>
              <label>{t("shop.filter.to", "To")} ¥<input type="number" name="max" min="0" defaultValue={Number.isFinite(maximum) ? maximum : ""} placeholder={t("shop.filter.no_limit", "No limit")} /></label>
            </div>
          </fieldset>
          <label className="catalog-stock-filter"><input type="checkbox" name="filter.v.availability" value="1" defaultChecked={availability === "1"} /> {t("shop.filter.in_stock_only", "In stock only")}</label>
          <div className="catalog-filter-actions"><button type="submit">{t("shop.filter.show_results", "Show results")} <span aria-hidden="true">→</span></button><Link href={clearHref}>{t("shop.filter.clear", "Clear filters")}</Link></div>
        </form>
      </div>
    </details>
  );
}
