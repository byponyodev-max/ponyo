"use client";

import { useLocalization } from "@/components/layout/localization-provider";

export function CategoryScrollButton() {
  const { t } = useLocalization();
  return (
    <button
      className="category-arrow"
      type="button"
      aria-label={t("static.category.scroll", "Scroll categories")}
      onClick={() => document.querySelector(".category-list")?.scrollBy({ left: 220, behavior: "smooth" })}
    >
      →
    </button>
  );
}
