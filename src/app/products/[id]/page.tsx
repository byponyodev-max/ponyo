 import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { LocalizedText } from "@/components/layout/localization-provider";
import { ProductPurchasePanel } from "@/components/product/product-purchase-panel";
import { ProductReservationPanel, ProductReviews } from "@/components/product/product-community";
import { ProductGrid } from "@/components/product/product-grid";
import { ProductGallery } from "@/components/product/product-gallery";
import { withProductVariantDemo } from "@/lib/product-variant-demo";
import { getLocalizedProductById, getLocalizedProducts } from "@/services/localized-products.server";
import { selectRelatedProducts } from "@/lib/related-products";
import { storefrontFeatures } from "@/lib/storefront-features";

const getProductPageData = cache(async (identifier: string) => {
  const products = await getLocalizedProducts("?limit=100");
  const product = products.find((item) => item.id === identifier)
    ?? products.find((item) => item.slug === identifier)
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
  const makerName = isExample ? null : product.makerName;
  const makerStory = isExample
    ? null
    : [product.makerStory, product.makerPhilosophy, product.makerProcess].filter(Boolean).join(" ") || null;
  const sizeAndWeight = Array.from(new Set([
    product.sizeTier,
    product.size,
    product.dimensions,
    !isExample && product.weightGrams !== null && product.weightGrams !== undefined ? `${product.weightGrams} g` : null,
  ].filter(Boolean))).join(" · ");
  const proofFacts = [
    { key: "maker", labelKey: "product.proof.maker", label: "Maker", value: makerName },
    { key: "story", labelKey: "product.proof.story", label: "Maker story", value: makerStory },
    { key: "materials", labelKey: "product.proof.materials", label: "Materials", value: isExample ? null : product.materials },
    { key: "size", labelKey: "product.proof.size_weight", label: "Size & weight", value: sizeAndWeight || null },
    { key: "edition", labelKey: "product.proof.edition", label: "Edition", value: !isExample && product.editionCount ? `${product.editionCount}` : null },
    { key: "delivery", labelKey: "product.proof.delivery", label: "Estimated delivery", value: !isExample ? product.estimatedDeliveryDate ?? product.dispatchTime : null },
  ];

  return (
    <SiteFrame className="store-page product-page">
      <section className="product-detail-layout">
        <div className="product-gallery-column">
          <ProductGallery title={product.name} images={productImages} />
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
              {proofFacts.map((fact) => <div className="product-proof-fact" key={fact.key}>
                <dt><LocalizedText translationKey={fact.labelKey} fallback={fact.label} /></dt>
                <dd>{fact.value || <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}</dd>
              </div>)}
              <div className="product-proof-fact product-proof-fact--exclusive">
                <dt><LocalizedText translationKey="product.proof.only_at_ponyo" fallback="ONLY AT PONYO" /></dt>
                <dd className="product-proof-exclusive-content">
                  <Image src="/ponyo-jellyfish.svg" width={64} height={64} alt="" aria-hidden="true" />
                  <span><strong>Ponyo</strong><small><LocalizedText translationKey="product.proof.exclusive_value" fallback="Exclusive to Ponyo" /></small></span>
                </dd>
              </div>
            </dl>
            <Link className="product-proof-size-guide" href="/#sizes"><LocalizedText translationKey="product.proof.size_guide" fallback="Explore the Ponyo Size Guide" /> <span aria-hidden="true">→</span></Link>
          </section>
          {product.makerSlug && !isExample && <Link className="product-brand-story" href={`/makers/${encodeURIComponent(product.makerSlug)}`}>
            <span className="product-brand-story-seal" aria-hidden="true">✧</span>
            <div className="product-brand-story-copy">
              <p className="eyebrow"><LocalizedText translationKey="product.proof.brand_spotlight" fallback="BRAND SPOTLIGHT" /></p>
              <h2>{makerName ?? product.brandName ?? product.supplierName}</h2>
              <p>{makerStory ?? <LocalizedText translationKey="product.proof.brand_spotlight_note" fallback="Meet the maker and discover more of their work." />}</p>
            </div>
            <span className="product-brand-story-link"><LocalizedText translationKey="product.proof.visit_maker" fallback="Meet the maker" /> <span aria-hidden="true">→</span></span>
          </Link>}
        </div>
        <div className="product-detail-copy"><ProductPurchasePanel product={displayProduct} />{storefrontFeatures.commerce && <p className="product-payment-caption">Secure checkout powered by Ponyo.</p>}{(storefrontFeatures.productReservations || hasWaitlist || product.reservationsOpen) && <ProductReservationPanel productId={product.id} productName={product.name} reservationsOpen={storefrontFeatures.productReservations || (!isExample && product.reservationsOpen === true)} />}</div>
      </section>
      {storefrontFeatures.productReviews && <ProductReviews productId={product.id} />}
      {related.length > 0 && <section className="related-products store-container"><div className="section-head"><div><p className="eyebrow">A FEW MORE TO LOVE</p><h2>You may also like</h2></div><Link className="text-link" href={`/shop?category=${product.categoryName.toLowerCase().replaceAll(" ", "-")}`}>See all →</Link></div><ProductGrid products={related} /></section>}
    </SiteFrame>
  );
}