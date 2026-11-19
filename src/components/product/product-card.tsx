"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";
import { storefrontFeatures } from "@/lib/storefront-features";
import type { Product } from "@/types/product";


export function ProductCard({ product, badge, compact = false }: { product: Product; badge?: string; compact?: boolean }) {
  const { formatPrice, t } = useLocalization();
  const productName = t(`product.names.${product.slug}`, product.name);
  const tags = product.tags ?? [];
  const isNew = product.isNew ?? tags.includes("new-arrival");
  const isXl = tags.includes("domina-xl") || /\bxl\b/i.test(`${product.name} ${product.sizeTier ?? ""} ${product.size ?? ""}`);
  const categoryLabel = product.size ?? t(`product.categories.${(product.productType === "Plush" ? product.categoryName : product.productType ?? product.categoryName).toLowerCase().replaceAll(" ", "_")}`, product.productType === "Plush" ? product.categoryName : product.productType ?? product.categoryName);
  const statusLabel = storefrontFeatures.productReservations
    ? t("product.status.preorder", "Pre-order")
    : product.availabilityStatus === "Coming Soon"
    ? t("product.status.coming_soon", "Coming soon")
    : product.availabilityStatus === "Waitlist"
      ? t("product.status.waitlist", "Join waitlist")
      : product.availabilityStatus === "Unavailable" || product.availability === "unavailable"
        ? t("product.status.unavailable", "Currently unavailable")
        : product.availabilityStatus === "Available" || product.availability === "available"
          ? t("product.status.available", "Available")
        : "";

  const labels = [...new Set([
    ...(badge ? [badge] : []),
    ...(statusLabel ? [statusLabel] : []),
    ...(isNew ? [t("product.label.new", "New")] : []),
    ...(tags.includes("premium") ? [t("product.label.premium", "Premium")] : []),
    ...(tags.includes("rare") ? [t("product.label.rare", "Rare")] : []),
    ...(isXl ? [t("product.label.xl", "XL")] : []),
  ])];

  return (
    <div className="product-card-item">
      <article className={`shop-product-card${compact ? " is-compact" : ""}`}>
        <Link className="shop-product-card-link" href={`/products/${product.id}`} aria-label={t("product.action.view", `View ${productName}`, { title: productName })} />
        <div className="shop-product-image">
          <Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 600px) 46vw, (max-width: 1000px) 30vw, 23vw" />
          <div className="product-labels">
            {labels.map((label) => <span key={label} className={`product-label ${label.toLowerCase().replaceAll(" ", "-")}${label === statusLabel ? " product-label--availability" : ""}`}>{label}</span>)}
          </div>
        </div>
        <div className="shop-product-info">
          <span className="shop-product-title">{productName}</span>
          <div className="shop-product-meta"><span>{categoryLabel}</span></div>
          {statusLabel && <p className="shop-product-availability">{statusLabel}</p>}
          <div className="shop-product-bottom">
            <strong className="shop-product-prices">
              <span className="shop-product-current-price">{formatPrice(product.priceAmount, product.currency)}</span>
            </strong>
            <span className="product-card-arrow" aria-hidden="true">→</span>
          </div>
          {product.dispatchTime && !storefrontFeatures.productReservations && <p className="shop-product-dispatch">{product.dispatchTime}</p>}
        </div>
      </article>
    </div>
  );
}
