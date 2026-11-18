import Image from "next/image";
import Link from "next/link";
import { LocalizedText } from "@/components/layout/localization-provider";
import { SiteFrame } from "@/components/layout/site-frame";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { getTranslations } from "next-intl/server";

const sizeTiers = [
  { id: "small", size: "Small", min: 0, max: 25, height: 25, rangeFallback: "Under 25 cm", title: "size.guide.small.title", range: "size.guide.small.range", feel: "size.guide.small.feel" },
  { id: "medium", size: "Medium", min: 25, max: 45, height: 45, rangeFallback: "25–45 cm", title: "size.guide.medium.title", range: "size.guide.medium.range", feel: "size.guide.medium.feel" },
  { id: "large", size: "Large", min: 45, max: 70, height: 70, rangeFallback: "45–70 cm", title: "size.guide.large.title", range: "size.guide.large.range", feel: "size.guide.large.feel" },
  { id: "xl", size: "XL", min: 70, max: Number.POSITIVE_INFINITY, height: 120, rangeFallback: "70+ cm", title: "size.guide.xl.title", range: "size.guide.xl.range", feel: "size.guide.xl.feel" },
] as const;

function measuredCentimeters(dimensions?: string) {
  const match = dimensions?.match(/(\d+(?:\.\d+)?)\s*cm/i);
  return match ? Number(match[1]) : null;
}

export default async function SizeGuidePage() {
  const [products, t] = await Promise.all([getLocalizedProducts(), getTranslations()]);
  const examples = sizeTiers.map((tier) => {
    const matches = products
      .map((product) => ({ product, centimeters: measuredCentimeters(product.dimensions) }))
      .filter(({ centimeters }) => centimeters !== null && centimeters >= tier.min && centimeters < tier.max)
      .sort((left, right) => (left.centimeters ?? 0) - (right.centimeters ?? 0));
    return matches[0]?.product ?? null;
  });

  return (
    <SiteFrame className="store-page size-guide-page">
      <header className="size-guide-page-hero store-container">
        <p className="eyebrow"><LocalizedText translationKey="size.guide.eyebrow" fallback="THE PONYO SIZE GUIDE" /></p>
        <h1><LocalizedText translationKey="size.guide.title" fallback="Find the size that feels right." /></h1>
        <p><LocalizedText translationKey="size.guide.intro" fallback="Compare real product measurements, understand each size range, and find a plush that fits your space." /></p>
        <Link className="shop-button shop-button-orange" href="/shop"><LocalizedText translationKey="size.guide.shop_all" fallback="Explore all plush" /> <span aria-hidden="true">→</span></Link>
      </header>

      <section className="size-guide-page-scale store-container" aria-labelledby="size-guide-scale-title">
        <div className="size-guide-page-section-heading">
          <p className="eyebrow"><LocalizedText translationKey="size.guide.scale.eyebrow" fallback="SIDE-BY-SIDE" /></p>
          <h2 id="size-guide-scale-title"><LocalizedText translationKey="size.guide.scale.title" fallback="Compare the size ranges" /></h2>
          <p><LocalizedText translationKey="size.guide.scale.body" fallback="The bars share one scale, from the smallest pals to our largest companions." /></p>
        </div>
        <div className="size-guide-page-ruler" aria-hidden="true">
          <span>0 cm</span><span>25 cm</span><span>45 cm</span><span>70 cm</span><span>120 cm</span>
        </div>
        <div className="size-guide-page-cards">
          {sizeTiers.map((tier, index) => {
            const example = examples[index];
            const centimeters = example ? measuredCentimeters(example.dimensions) : null;
            return <article className={`size-guide-page-card size-guide-page-card--${tier.id}`} key={tier.id}>
              <div className="size-guide-page-card-visual" aria-hidden="true">
                <span className="size-guide-page-measure">{tier.height} cm</span>
                <span className="size-guide-page-bar" style={{ height: `${Math.max(14, (tier.height / 120) * 100)}%` }} />
              </div>
              <div className="size-guide-page-card-copy">
                <h3><LocalizedText translationKey={tier.title} fallback={tier.size} /></h3>
                <strong><LocalizedText translationKey={tier.range} fallback={tier.rangeFallback} /></strong>
                <p><LocalizedText translationKey={tier.feel} fallback="Check the listed dimensions on each product." /></p>
                {example ? <Link className="size-guide-page-example" href={`/products/${encodeURIComponent(example.id)}`}>
                  <Image src={example.image} alt="" width={54} height={54} />
                  <span><small><LocalizedText translationKey="size.guide.example" fallback="Catalog example" /></small><strong>{example.name}</strong><small>{centimeters} cm</small></span>
                  <span aria-hidden="true">→</span>
                </Link> : <p className="size-guide-page-no-example"><LocalizedText translationKey="size.guide.no_example" fallback="There is no product in this size range in the current catalog yet." /></p>}
                <Link className="size-guide-page-shop-link" href={`/shop?size=${encodeURIComponent(tier.size)}`}>
                  <LocalizedText translationKey="size.guide.shop_size" fallback={`Shop ${tier.size}`} values={{ size: t(tier.title) }} /> <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="size-guide-page-notes store-container">
        <article>
          <span className="size-guide-page-note-mark" aria-hidden="true">✦</span>
          <h2><LocalizedText translationKey="size.guide.measure.title" fallback="How to compare measurements" /></h2>
          <p><LocalizedText translationKey="size.guide.measure.body" fallback="Use the product's listed dimensions as your reference. Plush shapes vary: ears, tails, wings, and soft limbs can change how a toy sits or stretches." /></p>
        </article>
        <article>
          <span className="size-guide-page-note-mark" aria-hidden="true">♡</span>
          <h2><LocalizedText translationKey="size.guide.space.title" fallback="Think about where it will live" /></h2>
          <p><LocalizedText translationKey="size.guide.space.body" fallback="For oversized plush, check the height of shelves, doorways, and the space beside your bed or sofa before choosing." /></p>
        </article>
      </section>

      <footer className="size-guide-page-footer store-container">
        <p><LocalizedText translationKey="size.guide.footer" fallback="Measurements are listed per product; if a detail is missing, contact Ponyo before reserving." /></p>
        <Link href="/pages/contact"><LocalizedText translationKey="size.guide.contact" fallback="Ask us about sizing" /> <span aria-hidden="true">→</span></Link>
      </footer>
    </SiteFrame>
  );
}
