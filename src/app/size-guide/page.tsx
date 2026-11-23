import Image from "next/image";
import Link from "next/link";
import { LocalizedText } from "@/components/layout/localization-provider";
import { SiteFrame } from "@/components/layout/site-frame";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { getTranslations } from "next-intl/server";
import { JellyfishArtwork } from "@/components/home/jellyfish-artwork";

const sizeTiers = [
  { id: "small", size: "Small", min: 0, max: 25, rangeFallback: "Under 25 cm", title: "size.guide.small.title", range: "size.guide.small.range", feel: "size.guide.small.feel" },
  { id: "medium", size: "Medium", min: 25, max: 45, rangeFallback: "25–45 cm", title: "size.guide.medium.title", range: "size.guide.medium.range", feel: "size.guide.medium.feel" },
  { id: "large", size: "Large", min: 45, max: 70, rangeFallback: "45–70 cm", title: "size.guide.large.title", range: "size.guide.large.range", feel: "size.guide.large.feel" },
  { id: "xl", size: "XL", min: 70, max: Number.POSITIVE_INFINITY, rangeFallback: "70+ cm", title: "size.guide.xl.title", range: "size.guide.xl.range", feel: "size.guide.xl.feel" },
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
  const heroExample = examples[3] ?? examples.find(Boolean) ?? products[0] ?? null;
  const heroCentimeters = heroExample ? measuredCentimeters(heroExample.dimensions) : null;

  return (
    <SiteFrame className="store-page size-guide-page">
      <header className="size-guide-page-hero store-container">
        <div className="size-guide-page-hero-copy">
          <p className="size-guide-page-hero-eyebrow"><span aria-hidden="true">✦</span><LocalizedText translationKey="size.guide.eyebrow" fallback="THE PONYO SIZE GUIDE" /><span aria-hidden="true">✦</span></p>
          <h1><LocalizedText translationKey="size.guide.title" fallback="Find the size that feels right." /></h1>
          <p className="size-guide-page-hero-intro"><LocalizedText translationKey="size.guide.intro" fallback="Compare real product measurements, understand each size range, and find a plush that fits your space." /></p>
          <div className="size-guide-page-hero-actions">
            <Link className="shop-button shop-button-orange" href="/shop"><LocalizedText translationKey="size.guide.shop_all" fallback="Explore all plush" /> <span aria-hidden="true">→</span></Link>
            <span><i aria-hidden="true">✧</i><LocalizedText translationKey="size.guide.scale.eyebrow" fallback="Real catalog measurements" /></span>
          </div>
        </div>
        <div className="size-guide-page-hero-art">
          <span className="size-guide-page-hero-halo" aria-hidden="true" />
          <span className="size-guide-page-hero-ruler" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          {heroExample && <div className="size-guide-page-hero-product">
            <Image src={heroExample.image} alt={heroExample.imageAlt} fill sizes="(max-width: 700px) 80vw, 38vw" />
          </div>}
          {heroExample && <div className="size-guide-page-hero-caption">
            <span><LocalizedText translationKey="size.guide.example" fallback="Catalog example" /></span>
            <strong>{heroExample.name}</strong>
            {heroCentimeters && <small>{heroCentimeters} cm</small>}
          </div>}
          <span className="size-guide-page-jellyfish size-guide-page-jellyfish--silver" aria-hidden="true"><JellyfishArtwork id="size-guide-page-silver" tone="silver" direction={1} /></span>
          <span className="size-guide-page-jellyfish size-guide-page-jellyfish--gold" aria-hidden="true"><JellyfishArtwork id="size-guide-page-gold" tone="gold" direction={-1} /></span>
          <span className="size-guide-page-sparkle size-guide-page-sparkle--one" aria-hidden="true">✦</span>
          <span className="size-guide-page-sparkle size-guide-page-sparkle--two" aria-hidden="true">✧</span>
        </div>
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
              <div className="size-guide-page-card-visual">
                <span className="size-guide-page-card-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="size-guide-page-measure"><LocalizedText translationKey={tier.range} fallback={tier.rangeFallback} /></span>
                {example ? <Image className="size-guide-page-reference" src={example.image} alt={example.imageAlt} width={480} height={480} sizes="(max-width: 560px) 85vw, (max-width: 900px) 42vw, 24vw" /> : <span className="size-guide-page-no-photo"><LocalizedText translationKey="size.guide.no_example" fallback="There is no product in this size range in the current catalog yet." /></span>}
                <span className="size-guide-page-photo-ruler" aria-hidden="true"><i /><i /><i /><i /><i /></span>
              </div>
              <div className="size-guide-page-card-copy">
                <h3><LocalizedText translationKey={tier.title} fallback={tier.size} /></h3>
                <strong><LocalizedText translationKey={tier.range} fallback={tier.rangeFallback} /></strong>
                <p><LocalizedText translationKey={tier.feel} fallback="Check the listed dimensions on each product." /></p>
                {example ? <Link className="size-guide-page-example" href={`/products/${encodeURIComponent(example.id)}`}>
                  <span><small><LocalizedText translationKey="size.guide.example" fallback="Catalog example" /></small><strong>{example.name}</strong><small>{centimeters ? `${centimeters} cm` : tier.rangeFallback}</small></span>
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
