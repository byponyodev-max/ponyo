 import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { LocalizedText } from "@/components/layout/localization-provider";
import { ProductPurchasePanel } from "@/components/product/product-purchase-panel";
import { ProductActionPanel, ProductReviews } from "@/components/product/product-community";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductGallery } from "@/components/product/product-gallery";
import { JellyfishArtwork } from "@/components/home/jellyfish-artwork";
import { withProductVariantDemo } from "@/lib/product-variant-demo";
import { getLocalizedProductById, getLocalizedProducts } from "@/services/localized-products.server";
import { selectRelatedProducts } from "@/lib/related-products";
import { storefrontFeatures } from "@/lib/storefront-features";

const getProductPageData = cache(async (identifier: string) => {
  const products = await getLocalizedProducts("?limit=100");
  const legacySampleSlug = identifier.startsWith("sample-")
    ? identifier.slice("sample-".length)
    : null;
  const product = products.find((item) => item.id === identifier)
    ?? products.find((item) => item.slug === identifier)
    ?? (legacySampleSlug ? products.find((item) => item.slug === legacySampleSlug) : undefined)
    ?? await getLocalizedProductById(identifier);
  return { product, products };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { product } = await getProductPageData(id);
  return product ? { title: `${product.name} – Ponyo`, description: product.description } : { title: "Plush not found" };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { product, products } = await getProductPageData(id);
  if (!product) notFound();
  if (product.id !== id) redirect(`/products/${encodeURIComponent(product.id)}`);
  const displayProduct = process.env.PONYO_VARIANT_DEMO === "true"
    ? withProductVariantDemo(product)
    : product;
  const selectedVariant = displayProduct.variants?.find((variant) => variant.id === displayProduct.variantId)
    ?? displayProduct.variants?.[0];
  const productImages = selectedVariant?.galleryImages?.length
    ? selectedVariant.galleryImages
    : displayProduct.galleryImages?.length
      ? displayProduct.galleryImages
      : [{ src: typeof displayProduct.image === "string" ? displayProduct.image : displayProduct.image.src, alt: displayProduct.imageAlt }];

  const related = selectRelatedProducts(products, product);
  const hasWaitlist = product.availability === "unavailable"
    || ["Coming Soon", "Waitlist", "Unavailable"].includes(product.availabilityStatus ?? "");
  const isExample = product.isExampleData === true || product.tags?.includes("demo") === true;
  const makerName = product.makerName;
  const makerStory = [product.makerStory, product.makerPhilosophy, product.makerProcess].filter(Boolean).join(" ") || null;
  const sizeAndWeight = Array.from(new Set([
    product.sizeTier,
    product.size,
    product.dimensions,
    product.weightGrams !== null && product.weightGrams !== undefined ? `${product.weightGrams} g` : null,
  ].filter(Boolean))).join(" · ");
  const proofFacts = [
    { key: "story", labelKey: "product.proof.story", label: "Maker story", mark: "❝", value: makerStory },
    { key: "maker", labelKey: "product.proof.maker", label: "Maker", mark: "♡", value: makerName },
    { key: "materials", labelKey: "product.proof.materials", label: "Materials", mark: "✿", value: product.materials },
    { key: "size", labelKey: "product.proof.size_weight", label: "Size & weight", mark: "↔", value: sizeAndWeight || null },
    { key: "edition", labelKey: "product.proof.edition", label: "Edition", mark: "✦", value: product.editionCount ? `${product.editionCount}` : null },
    { key: "delivery", labelKey: "product.proof.delivery", label: "Estimated delivery", mark: "☼", value: product.estimatedDeliveryDate ?? product.dispatchTime },
  ];

  return (
    <SiteFrame className="store-page product-page">
      <section className="product-detail-layout">
        <div className="product-gallery-column">
          <div className="product-gallery-hero" id="product-gallery-top">
            <ProductGallery title={product.name} images={productImages} />
            {product.onlyAtPonyo && <span className="product-gallery-approval-badge">
              <span className="product-gallery-approval-star" aria-hidden="true">★</span>
              <span className="product-gallery-approval-copy">
                <LocalizedText translationKey="product.proof.only_at_ponyo" fallback="Only at Ponyo" />
                <small><LocalizedText translationKey="product.proof.exclusive" fallback="Exclusive" /></small>
              </span>
            </span>}
          </div>
          <section className="product-proof product-proof-in-gallery" aria-labelledby="product-proof-title">
            <div className="product-proof-heading">
              <span className="product-proof-seal" aria-hidden="true">✦</span>
              <div>
                <p className="eyebrow"><LocalizedText translationKey="product.proof.eyebrow" fallback="A CLOSER LOOK" /></p>
                <h2 id="product-proof-title"><LocalizedText translationKey="product.proof.title" fallback="The details behind this plush" /></h2>
                <p><LocalizedText translationKey="product.proof.intro" fallback="Maker and product details, gathered in one place." /></p>
              </div>
            </div>
            <dl className="product-proof-grid">
              {proofFacts.map((fact) => <div className={`product-proof-fact product-proof-fact--${fact.key}`} key={fact.key}>
                <dt><span className="product-proof-fact-mark" aria-hidden="true">{fact.mark}</span><LocalizedText translationKey={fact.labelKey} fallback={fact.label} /></dt>
                <dd>{fact.value || <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}</dd>
              </div>)}
            </dl>
            <Link className="product-proof-size-guide" href="/size-guide"><LocalizedText translationKey="product.proof.size_guide" fallback="Explore the Ponyo Size Guide" /> <span aria-hidden="true">→</span></Link>
          </section>
        </div>
        <div className="product-detail-copy"><ProductPurchasePanel product={displayProduct} />{storefrontFeatures.commerce && <p className="product-payment-caption"><LocalizedText as="span" translationKey="pages.product.payment_caption" fallback="Secure checkout powered by Ponyo." /></p>}{(storefrontFeatures.productReservations || hasWaitlist || product.reservationsOpen) && <ProductActionPanel productId={product.id} productName={product.name} shippingCountries={product.shippingCountries} reservationsOpen={product.reservationsOpen === true} reservationDeadline={product.reservationDeadline} productionStatus={product.productionStatus} />}</div>
      </section>
      {product.makerSlug && <Link className="product-brand-story" href={`/makers/${encodeURIComponent(product.makerSlug)}`}>
        <span className="product-brand-story-seal" aria-hidden="true">✧</span>
        <div className="product-brand-story-copy">
          <p className="eyebrow"><LocalizedText translationKey="product.proof.brand_spotlight" fallback="BRAND SPOTLIGHT" /></p>
          <h2>{makerName ?? product.brandName ?? product.supplierName}</h2>
          <p>{makerStory ?? <LocalizedText translationKey="product.proof.brand_spotlight_note" fallback="Meet the maker and discover more of their work." />}</p>
        </div>
        <div className="product-brand-story-actions">
          <span className="product-brand-story-link"><LocalizedText translationKey="product.proof.visit_maker" fallback="Meet the maker" /> <span aria-hidden="true">→</span></span>
          <div className="product-brand-story-art" aria-hidden="true">
            <span className="product-brand-story-jellyfish product-brand-story-jellyfish--silver"><JellyfishArtwork id="product-maker-silver" tone="silver" direction={1} /></span>
            <span className="product-brand-story-jellyfish product-brand-story-jellyfish--gold"><JellyfishArtwork id="product-maker-gold" tone="gold" direction={-1} /></span>
            <span className="product-brand-story-sparkle product-brand-story-sparkle--one">✦</span>
            <span className="product-brand-story-sparkle product-brand-story-sparkle--two">✧</span>
          </div>
        </div>
      </Link>}
      {storefrontFeatures.productReviews && <ProductReviews productId={product.id} />}
      {related.length > 0 && <section className="related-products store-container"><div className="section-head"><div><p className="eyebrow"><LocalizedText as="span" translationKey="pages.product.related_eyebrow" fallback="A FEW MORE TO LOVE" /></p><h2><LocalizedText as="span" translationKey="pages.product.related_title" fallback="You may also like" /></h2></div><Link className="text-link" href={`/shop?category=${product.categoryName.toLowerCase().replaceAll(" ", "-")}`}><LocalizedText as="span" translationKey="pages.product.see_all" fallback="See all →" /></Link></div><ProductGrid products={related} /></section>}
    </SiteFrame>
  );
}