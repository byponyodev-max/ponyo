 import type { Metadata } from "next";
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
  const isExample = product.isExampleData === true;
  const makerName = isExample ? null : product.makerName;
  const makerStory = isExample ? null : product.makerStory;
  const sizeAndWeight = [
    !isExample ? product.size ?? product.dimensions : null,
    !isExample && product.weightGrams !== null && product.weightGrams !== undefined ? `${product.weightGrams} g` : null,
  ].filter(Boolean).join(" · ");

  return (
    <SiteFrame className="store-page product-page">
      <section className="product-detail-layout">
        <div className="product-gallery-column">
          <ProductGallery title={product.name} images={productImages} />
        </div>
        <div className="product-detail-copy"><ProductPurchasePanel product={displayProduct} />{storefrontFeatures.commerce && <p className="product-payment-caption">Secure checkout powered by Ponyo.</p>}{(storefrontFeatures.productReservations || hasWaitlist || product.reservationsOpen) && <ProductReservationPanel productId={product.id} productName={product.name} reservationsOpen={storefrontFeatures.productReservations || (!isExample && product.reservationsOpen === true)} />}</div>
      </section>
      <section className="product-proof" aria-labelledby="product-proof-title">
        <div className="product-proof-heading"><p className="eyebrow"><LocalizedText translationKey="product.proof.eyebrow" fallback="A CLOSER LOOK" /></p><h2 id="product-proof-title"><LocalizedText translationKey="product.proof.title" fallback="The details behind this plush" /></h2><p><LocalizedText translationKey="product.proof.intro" fallback="Maker-supplied details are shown when available. We won’t fill in the gaps with guesses." /></p></div>
        <dl className="product-proof-grid">
          <div><dt><LocalizedText translationKey="product.proof.maker" fallback="Maker" /></dt><dd>{makerName ?? <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}{product.makerSlug && !isExample && <Link className="product-profile-link" href={`/makers/${encodeURIComponent(product.makerSlug)}`}><LocalizedText translationKey="product.proof.visit_maker" fallback="Meet the maker" /> <span aria-hidden="true">→</span></Link>}</dd></div>
          <div className="product-proof-story"><dt><LocalizedText translationKey="product.proof.story" fallback="Maker story" /></dt><dd>{makerStory ?? <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}</dd></div>
          <div><dt><LocalizedText translationKey="product.proof.materials" fallback="Materials" /></dt><dd>{!isExample && product.materials ? product.materials : <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}</dd></div>
          <div><dt><LocalizedText translationKey="product.proof.size_weight" fallback="Size & weight" /></dt><dd>{sizeAndWeight || <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}</dd></div>
          <div><dt><LocalizedText translationKey="product.proof.edition" fallback="Edition" /></dt><dd>{!isExample && product.editionCount ? <LocalizedText translationKey="product.proof.edition_count" fallback="{{count}} pieces" values={{ count: product.editionCount }} /> : <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}</dd></div>
          <div><dt><LocalizedText translationKey="product.proof.delivery" fallback="Estimated delivery" /></dt><dd>{!isExample && product.estimatedDeliveryDate ? product.estimatedDeliveryDate : <LocalizedText translationKey="product.proof.not_provided" fallback="Not provided by the maker yet." />}</dd></div>
          <div className={product.onlyAtPonyo && !isExample ? "product-proof-exclusive" : ""}><dt><LocalizedText translationKey="product.proof.exclusive" fallback="Only at Ponyo" /></dt><dd>{product.onlyAtPonyo && !isExample ? <LocalizedText translationKey="product.proof.exclusive_value" fallback="Ponyo-exclusive" /> : <LocalizedText translationKey="product.proof.exclusive_missing" fallback="No exclusivity claim provided." />}</dd></div>
        </dl>
        {isExample && <small className="product-proof-note"><LocalizedText translationKey="product.proof.sample_note" fallback="Illustrative catalog preview — maker and product details have not been verified." /></small>}
        <Link className="product-proof-size-guide" href="/#sizes"><LocalizedText translationKey="product.proof.size_guide" fallback="Explore the Ponyo Size Guide" /> <span aria-hidden="true">→</span></Link>
      </section>
      {storefrontFeatures.productReviews && <ProductReviews productId={product.id} />}
      {related.length > 0 && <section className="related-products store-container"><div className="section-head"><div><p className="eyebrow">A FEW MORE TO LOVE</p><h2>You may also like</h2></div><Link className="text-link" href={`/shop?category=${product.categoryName.toLowerCase().replaceAll(" ", "-")}`}>See all →</Link></div><ProductGrid products={related} /></section>}
    </SiteFrame>
  );
}