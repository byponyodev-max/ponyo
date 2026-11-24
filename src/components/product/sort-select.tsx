"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";

type SortOption = { value: string; label: string; key?: string };

const sortOptions: SortOption[] = [
  { value: "featured", key: "shop.sort.featured", label: "Featured" },
  { value: "relevance", key: "shop.sort.relevance", label: "Most relevant" },
  { value: "best-selling", key: "shop.sort.best_selling", label: "Best selling" },
  { value: "title-ascending", key: "shop.sort.title_ascending", label: "Alphabetically, A–Z" },
  { value: "title-descending", key: "shop.sort.title_descending", label: "Alphabetically, Z–A" },
  { value: "price-ascending", key: "shop.sort.price_ascending", label: "Price, low to high" },
  { value: "price-descending", key: "shop.sort.price_descending", label: "Price, high to low" },
  { value: "created-ascending", key: "shop.sort.created_ascending", label: "Date, old to new" },
  { value: "created-descending", key: "shop.sort.created_descending", label: "Date, new to old" },
];

export function SortSelect({ value, category, search, action = "/shop", preservedFilters = {}, options = sortOptions }: { value: string; category: string; search: string; action?: string; preservedFilters?: Record<string, string>; options?: SortOption[] }) {
  const { t } = useLocalization();
  const optionsId = `sort-options-${useId().replaceAll(":", "")}`;
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const labelFor = (option: SortOption) => option.key ? t(option.key, option.label) : option.label;
  const selectedLabel = labelFor(selectedOption);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function dismissOutside(event: Event) {
      const menu = menuRef.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, []);

  return (
    <form className="sort-select-form" action={action} method="get" onSubmit={() => setIsOpen(false)}>
      {category && <input type="hidden" name="category" value={category} />}
      {search && <input type="hidden" name="q" value={search} />}
      {Object.entries(preservedFilters).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className="sort-filter">
        <span>{t("shop.sort.label", "Sort by")}</span>
        <div ref={menuRef} className={`sort-menu${isOpen ? " is-open" : ""}`} onKeyDown={(event) => {
          if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            setIsOpen(false);
            menuRef.current?.querySelector<HTMLButtonElement>(".sort-menu-trigger")?.focus({ preventScroll: true });
          }
        }}>
          <button type="button" className="sort-menu-trigger" aria-label={t("shop.sort.current", "Sort by, currently {{label}}", { label: selectedLabel })} aria-expanded={isOpen} aria-controls={optionsId} onClick={() => setIsOpen((open) => !open)}>
            <span>{selectedLabel}</span>
            <svg className="catalog-chevron sort-menu-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {isOpen && <div id={optionsId} className="sort-menu-options" role="group" aria-label={t("shop.sort.options_aria", "Sort products")}>
            {options.map((option) => (
              <button key={option.value} type="submit" name="sort_by" value={option.value} aria-pressed={option.value === value}>
                <span>{labelFor(option)}</span><span className="sort-menu-check" aria-hidden="true">✓</span>
              </button>
            ))}
          </div>}
        </div>
      </div>
    </form>
  );
}
