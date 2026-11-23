"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/types/product";

export function StoreSearch({ compactHeader = false }: { compactHeader?: boolean }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { formatPrice: formatLocalizedPrice, language, t } = useLocalization();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsKey, setProductsKey] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  function openSearch(fromCompactHeader = false) {
    setCompactOpen(fromCompactHeader || compactHeader);
    setOpen(true);
  }

  function closeSearch() {
    setOpen(false);
    setCompactOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  useEffect(() => {
    if (compactHeader) return;
    const openFromCompactHeader = () => {
      setCompactOpen(true);
      setOpen(true);
    };
    window.addEventListener("ponyo:open-search", openFromCompactHeader);
    return () => window.removeEventListener("ponyo:open-search", openFromCompactHeader);
  }, [compactHeader]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeSearch();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const normalized = query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const requestKey = `${language}\u0000${normalized}`;

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ locale: language, limit: "100" });
    if (normalized) params.set("q", query.trim());
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(false);
      void (async () => {
        try {
          const response = await fetch(`/api/products?${params.toString()}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`Search request failed with status ${response.status}.`);
          const payload = await response.json() as { data?: Product[] };
          if (!Array.isArray(payload.data)) throw new Error("Search response did not contain a product list.");
          if (active) {
            setProducts(payload.data);
            setProductsKey(requestKey);
          }
        } catch (error) {
          if (!active || controller.signal.aborted) return;
          console.error("Unable to load localized search results.", error);
          setProducts([]);
          setProductsKey(requestKey);
          setLoadError(true);
        } finally {
          if (active && !controller.signal.aborted) setLoading(false);
        }
      })();
    }, normalized ? 180 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [language, normalized, open, query, requestKey]);

  const isCurrentSearch = productsKey === requestKey;
  const visibleProducts = isCurrentSearch ? products : [];
  const results = normalized
    ? visibleProducts.filter((product) => `${product.name} ${product.description} ${product.productType ?? ""} ${(product.tags ?? []).join(" ")}`.toLocaleLowerCase().includes(normalized)).slice(0, 8)
    : visibleProducts.slice(0, 4);
  const isLoading = !isCurrentSearch || loading;
  const hasLoadError = isCurrentSearch && loadError;

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActiveIndex((index) => index <= 0 ? results.length - 1 : index - 1);
    } else if (event.key === "Escape" && activeIndex >= 0) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(-1);
    } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      router.push(`/products/${results[activeIndex].id}`);
    }
  }

  return (
    <div ref={rootRef} className={`store-search-root${open ? " is-search-open" : ""}${compactOpen ? " is-compact-search-open" : ""}`}>
      {compactOpen && <button type="button" className="predictive-search-backdrop" aria-label={t("static.search.close", "Close search")} onClick={closeSearch} />}
      <button ref={triggerRef} className="store-search-trigger" type="button" onClick={() => openSearch(compactHeader)} aria-label={t("search.products_heading", "Search products")} aria-expanded={open}>
        <span>{t("home.header.search_placeholder", "Find a plush friend you’ll love…")}</span><span className="store-search-trigger-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></span>
      </button>
      {open && <div className="predictive-search-popover" role="dialog" aria-label={t("search.title", "Search Ponyo")}>
        <form action="/search" method="get" className="predictive-search-form" role="search" onSubmit={(event) => { event.preventDefault(); router.push(`/search?q=${encodeURIComponent(query)}`); closeSearch(); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <label className="sr-only" htmlFor="ponyo-search-input">{t("search.products_heading", "Search products")}</label>
          <input id="ponyo-search-input" ref={inputRef} type="search" name="q" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); }} onKeyDown={onKeyDown} placeholder={t("search.placeholder", "Search by plush, character, or size…")} autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls="ponyo-search-listbox" aria-expanded={results.length > 0 || isLoading} aria-activedescendant={activeIndex >= 0 ? `ponyo-search-option-${activeIndex}` : undefined} />
          {query && <button type="button" className="predictive-clear" aria-label={t("general.clear", "Clear search")} onClick={() => { setQuery(""); inputRef.current?.focus(); }}>×</button>}
          <button type="submit" className="predictive-submit" aria-label={t("general.search", "Search")}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2"/><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button>
          <button type="button" className="predictive-close" aria-label={t("general.close", "Close search")} onClick={closeSearch}>×</button>
        </form>
        <div className="predictive-results" id="ponyo-search-listbox" role="listbox" aria-label={t("search.suggestions", "Search suggestions")}>
          <p className="predictive-results-heading">{isLoading ? t("static.search.loading", "Searching…") : normalized ? t(results.length === 1 ? "search.result_count_one" : "search.result_count_other", `${results.length} ${results.length === 1 ? "result" : "results"}`, { count: results.length }) : t("search.popular", "Popular plush")}</p>
          {normalized && <Link className="predictive-query-suggestion" href={`/search?q=${encodeURIComponent(query)}`} onClick={closeSearch}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8"/><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><span>{t("search.for_query", `Search for “${query}”`, { query })}</span><b aria-hidden="true">↗</b></Link>}
          {isLoading ? <p className="predictive-no-results">{t("static.search.loading", "Searching…")}</p> : hasLoadError ? <p className="predictive-no-results">{t("static.search.load_error", "Search is temporarily unavailable. Please try again.")}</p> : results.length ? <ul>{results.map((product, index) => {
            const source = typeof product.image === "string" ? product.image : product.image.src;
            const productName = t(`product.names.${product.slug}`, product.name);
            return <li key={product.id} role="option" aria-selected={index === activeIndex} id={`ponyo-search-option-${index}`} data-search-active={index === activeIndex || undefined}><Link href={`/products/${product.id}`} tabIndex={-1} onClick={closeSearch}><Image src={source} alt={product.imageAlt} width={52} height={52} /><span><strong>{productName}</strong><small>{product.size ?? product.categoryName}</small><b>{formatLocalizedPrice(product.priceAmount, product.currency)}</b></span><i aria-hidden="true">›</i></Link></li>;
          })}</ul> : <p className="predictive-no-results">{normalized ? t("static.search.no_results", "No plush found for “{{query}}”.", { query: query.trim() }) : t("search.no_suggestions", "No suggestions yet.")}</p>}
          {normalized && <Link className="predictive-view-all" href={`/search?q=${encodeURIComponent(query)}`} onClick={closeSearch}>{t("search.view_all_for", `View all results for “${query}” →`, { query })}</Link>}
        </div>
      </div>}
    </div>
  );
}
