"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { ProductGrid } from "@/components/product/product-grid";
import { useLocalization } from "@/components/layout/localization-provider";
import type { Product } from "@/types/product";
import { animalFilters, matchesAnimal } from "@/lib/product-animals";

export function AnimalTabs({ products }: { products: Product[] }) {
  const { t } = useLocalization();
  const availableTabs = animalFilters;
  const [active, setActive] = useState<string>(availableTabs[0]?.slug ?? "");
  const current = availableTabs.find((tab) => tab.slug === active) ?? availableTabs[0];
  if (!current) return null;
  const matching = products.filter((product) => matchesAnimal(product, current.tags)).slice(0, 8);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + offset + availableTabs.length) % availableTabs.length;
    setActive(availableTabs[next].slug);
    document.getElementById(`animal-tab-${availableTabs[next].slug}`)?.focus();
  }

  return (
    <section className="animal-tabs-section store-container" aria-labelledby="animals-heading">
      <div className="animal-tabs-heading" data-sparkle-end><h2 id="animals-heading">{t("home.aisles.animal_title", "Shop by animal")}</h2><p>{t("home.aisles.animal_sub", "Bears, bunnies, cats and more. Pick a favourite and meet the family.")}</p></div>
      <div className="animal-tabs-list" role="tablist" aria-label={t("home.category_rail.aria_label", "Shop by animal")}>
        {availableTabs.map((tab, index) => {
          const item = products.find((product) => matchesAnimal(product, tab.tags));
          return <button key={tab.slug} id={`animal-tab-${tab.slug}`} type="button" role="tab" aria-selected={active === tab.slug} aria-controls={`animal-panel-${tab.slug}`} tabIndex={active === tab.slug ? 0 : -1} onClick={() => setActive(tab.slug)} onKeyDown={(event) => onKeyDown(event, index)}>{item && <span className="animal-tab-image"><Image src={item.image} alt="" width={32} height={32} /></span>}{t(tab.key, tab.name)}</button>;
        })}
      </div>
      <div role="tabpanel" id={`animal-panel-${current.slug}`} aria-labelledby={`animal-tab-${current.slug}`}>
        <ProductGrid products={matching} fillSlots fillColumns={[2, 3, 5, 5]} promoCount={2} />
        <Link className="animal-tabs-all" href={current.slug === "all" ? "/collections/all" : `/collections/${current.slug}`}>{t("home.aisles.see_more", "Shop all {{title}} →", { title: current.name })}</Link>
      </div>
    </section>
  );
}
