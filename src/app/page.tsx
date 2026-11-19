import Image from "next/image";
import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";
import { HomeCarousel } from "@/components/home/home-carousel";
import { HomeSparkleRain } from "@/components/home/home-sparkle-rain";
import { AnimalTabs } from "@/components/home/animal-tabs";
import { JellyfishArtwork } from "@/components/home/jellyfish-artwork";
import { ProductShelf } from "@/components/product/product-shelf";
import { HomeBudgetLinks } from "@/components/home/home-budget-links";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { LocalizedPrice, LocalizedText } from "@/components/layout/localization-provider";
import { getTranslations } from "next-intl/server";
import type { Product } from "@/types/product";
import locale from "@/locales/en.default.json";

const images = {
  bunny: "/images/catalog/maker-bunny.jpg",
  bear: "/images/catalog/maker-bear.jpg",
  cat: "/images/catalog/maker-cat.jpg",
  dinosaur: "/images/catalog/maker-dinosaur.jpg",
  dog: "/images/catalog/maker-dog.jpg",
  penguin: "/images/catalog/maker-penguin.jpg",
  chick: "/images/catalog/maker-chick.jpg",
  panda: "/images/catalog/ponyo-12.png",
  premium: "/images/catalog/ponyo-5.png",
  xlCat: "/images/catalog/ponyo-11.png",
};

const categories = [
  { title: "Giant plush", href: "/pages/domina-xl", image: "/images/catalog/ponyo-3.png" },
  { title: "Bears", href: "/collections/bears", image: images.bear },
  { title: "Bunnies", href: "/collections/bunnies", image: images.bunny },
  { title: "Cats", href: "/collections/cats", image: images.cat },
  { title: "Cute Characters", href: "/collections/characters", image: images.dinosaur },
  { title: "Premium", href: "/collections/premium", image: images.premium },
  { title: "Pandas", href: "/collections/pandas", image: images.panda },
  { title: "Puppies", href: "/collections/puppies", image: images.dog },
  { title: "Penguins", href: "/collections/penguins", image: images.penguin },
  { title: "More plush", href: "/collections/all", image: images.chick },
];

const sizeGuideJellyfish = [
  { className: "size-guide-hero-jellyfish--left", tone: "blue", direction: 1, delay: "-1.2s", duration: "7.2s" },
  { className: "size-guide-hero-jellyfish--right", tone: "gold", direction: -1, delay: "-3.8s", duration: "8.4s" },
  { className: "size-guide-hero-jellyfish--upper-left", tone: "silver", direction: 1, delay: "-4.9s", duration: "6.5s" },
  { className: "size-guide-hero-jellyfish--upper-right", tone: "blue", direction: -1, delay: "-2.1s", duration: "9.1s" },
  { className: "size-guide-hero-jellyfish--middle-left", tone: "silver", direction: 1, delay: "-5.7s", duration: "8.8s" },
  { className: "size-guide-hero-jellyfish--middle-right", tone: "gold", direction: -1, delay: "-3.2s", duration: "7.7s" },
  { className: "size-guide-hero-jellyfish--lower-left", tone: "blue", direction: 1, delay: "-6.3s", duration: "9.6s" },
  { className: "size-guide-hero-jellyfish--lower-right", tone: "silver", direction: -1, delay: "-.6s", duration: "6.9s" },
] as const;

function byTag(products: Product[], tag: string, limit = 4) {
  return products.filter((product) => product.tags?.includes(tag)).slice(0, limit);
}

function AisleCard({ title, description, titleKey, descriptionKey, href, products }: { title: string; description: string; titleKey: string; descriptionKey: string; href: string; products: Product[] }) {
  return (
    <article className="marketplace-aisle">
      <LocalizedText as="h3" translationKey={titleKey} fallback={title} /><LocalizedText as="p" translationKey={descriptionKey} fallback={description} />
      <div className="marketplace-aisle-grid">
        {products.slice(0, 4).map((product) => <Link href={`/products/${product.id}`} className="aisle-product" key={product.id}><span className="aisle-product-image"><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 640px) 42vw, 130px" /></span><span className="aisle-product-title"><LocalizedText translationKey={`product.names.${product.slug}`} fallback={product.name} /></span><strong><LocalizedPrice amount={product.priceAmount} sourceCurrency={product.currency} /></strong></Link>)}
        {products.length > 0 && products.length < 4 && <Link href={href} className="aisle-see-all"><span>→</span><LocalizedText translationKey="home.see_all_short" fallback="See all" /></Link>}
      </div>
      <Link href={href} className="aisle-link"><LocalizedText translationKey="home.aisles.see_more_simple" fallback={`Shop more ${title} →`} /></Link>
    </article>
  );
}

export default async function Home() {
  const t = await getTranslations();
  const products = await getLocalizedProducts();
  const premium = byTag(products, "premium", 12);
  const domina = byTag(products, "domina-xl", 6);
  const arrivals = byTag(products, "new-arrival", 10);
  const allTrending = products.filter((product) => !product.tags?.includes("new-arrival")).slice(0, 12);
  const aisles = [
    { title: "Premium Plushies", description: "Top-quality plush with extra-soft finishes.", titleKey: "home.aisles.premium_title", descriptionKey: "home.aisles.premium_sub", href: "/collections/premium", products: premium.slice(0, 4) },
    { title: "XL Goodies", description: "Giant plush, big enough to hug back.", titleKey: "home.aisles.xl_title", descriptionKey: "home.aisles.xl_sub", href: "/collections/domina-xl", products: domina },
    { title: "Shop by animal", description: "Bears, bunnies, cats and more.", titleKey: "home.aisles.animal_title", descriptionKey: "home.aisles.animal_sub", href: "/collections", products: ["bears", "bunnies", "cats", "pandas"].map((category) => products.find((product) => product.categoryName.toLocaleLowerCase() === category || product.tags?.some((tag) => tag.toLocaleLowerCase() === category))).filter((product): product is Product => Boolean(product)) },
  ];
  const faq = locale.pg.faq;
  const faqRows: Array<[keyof typeof faq, keyof typeof faq]> = [["ordering_q1", "ordering_a1"], ["shipping_q2", "shipping_a2"], ["sizes_q1", "sizes_a1"]];

  return (
    <SiteFrame className="store-home">
      <HomeSparkleRain />
      <HomeCarousel hasCollectibles={products.some((product) => product.tags?.includes("collectibles"))} />

      <section className="home-marketplace-intro" aria-labelledby="home-hero-heading">
        <span className="home-marketplace-eyebrow"><LocalizedText translationKey="home.marketplace.hero_eyebrow" fallback={locale.mp.hero_eyebrow} /></span>
        <h1 id="home-hero-heading"><LocalizedText as="span" translationKey="home.marketplace.hero_heading" fallback={locale.mp.hero_heading} /> <span><LocalizedText translationKey="home.marketplace.hero_heading_accent" fallback={locale.mp.hero_heading_accent} /></span></h1>
        <p><LocalizedText translationKey="home.marketplace.hero_body" fallback={locale.mp.hero_body} /></p>
        <div className="home-marketplace-actions">
          <Link href="/collections/all"><LocalizedText translationKey="home.marketplace.hero_cta_shop" fallback={locale.mp.hero_cta_shop} /></Link>
          <Link href="/pages/domina-xl"><LocalizedText translationKey="home.marketplace.hero_cta_domina" fallback={locale.mp.hero_cta_domina} /></Link>
        </div>
      </section>

      <nav className="home-category-rail" aria-label={t("home.category_rail.aria_label")}>
        <div className="home-category-rail-card"><strong><LocalizedText translationKey="home.category_rail.title" fallback="Find your kind of plush" /></strong>
          <ul>{categories.map((category) => <li key={category.title}><Link href={category.href}><Image src={category.image} alt="" width={56} height={56} /><span><LocalizedText translationKey={`home.categories.${category.title === "Giant plush" ? "giant" : category.title === "Cute Characters" ? "characters" : category.title === "Premium" ? "premium" : category.title === "More plush" ? "more" : category.title.toLowerCase()}`} fallback={category.title} /></span></Link></li>)}</ul>
        </div>
      </nav>

      <section className="marketplace-aisles store-container" aria-labelledby="aisles-heading">
        <header><div><span className="marketplace-aisles-eyebrow"><LocalizedText translationKey="home.aisles.eyebrow" fallback="A little something for everyone" /></span><h2 id="aisles-heading"><LocalizedText as="span" translationKey="home.aisles.title" fallback="Shop every kind of plush" /></h2><p><LocalizedText translationKey="home.aisles.sub" fallback="Rare finds, premium plushies and XL goodies, all in one place." /></p></div><Link href="/collections/all" className="marketplace-aisles-view-all"><LocalizedText translationKey="home.aisles.view_all" fallback="Explore all plush" /> <span aria-hidden="true">→</span></Link></header>
        <div className="marketplace-aisles-grid">{aisles.map((aisle) => <AisleCard key={aisle.title} {...aisle} />)}</div>
      </section>

      <section className="budget-section store-container">
        <header><h2><LocalizedText translationKey="home.budget.title" fallback="Shop by budget" /></h2><p><LocalizedText translationKey="home.budget.sub" fallback="Find your next plush at the price that feels right." /></p></header>
        <HomeBudgetLinks />
      </section>

      <ProductShelf className="home-live-shelf" id="new-arrivals" eyebrow="Just landed" title="Just landed" description="The newest plush on Ponyo. Swipe to see them all." products={arrivals} href="/collections/new-arrivals" linkLabel="See all →" rail compact />
      <ProductShelf className="home-live-shelf" id="more-plush" eyebrow="Trending now" title="More plush to discover" description="A fresh mix from across the Ponyo catalog." products={allTrending} href="/collections/all" linkLabel="See all →" />
      <AnimalTabs products={products} />

      <section className="lifestyle-break">
        <Image src="/images/catalog/ponyo-6.png" alt={t("home.image_alt.lifestyle")} fill sizes="100vw" />
        <div><span aria-hidden="true">🧸</span><h2><LocalizedText translationKey="home.lifestyle.title" fallback="Every plush has a story. Find yours." /></h2><Link href="/shop"><LocalizedText translationKey="home.lifestyle.cta" fallback="Shop all plush →" /></Link></div>
      </section>

      <section className="size-guide store-container" id="sizes">
        <header>
          <div className="domina-quote-marquee" aria-label={t("home.size.marquee_label")}>
            <div className="domina-quote-track" aria-hidden="true">
              <span>DOMINA XL <i>✦</i> {t("home.size.marquee_big_hugs")} <i>✦</i> {t("home.size.marquee_up_to")} <i>✦</i> <LocalizedText translationKey="home.size.domina_quote" fallback="A little more room for wonder" /></span>
              <span>DOMINA XL <i>✦</i> {t("home.size.marquee_big_hugs")} <i>✦</i> {t("home.size.marquee_up_to")} <i>✦</i> <LocalizedText translationKey="home.size.domina_quote" fallback="A little more room for wonder" /></span>
            </div>
          </div>
          <Link className="size-guide-promo" href="/pages/domina-xl">
            <span className="size-guide-promo-mark" aria-hidden="true">✦</span>
            <span className="size-guide-promo-copy"><strong><LocalizedText translationKey="home.size.domina_promo_title" fallback="Meet Domina XL Goodies" /></strong><small><LocalizedText translationKey="home.size.domina_promo_body" fallback="Ponyo’s oversized plush icons · up to 120 cm" /></small></span>
            <span className="size-guide-promo-link"><LocalizedText translationKey="home.size.domina_promo_link" fallback="Explore" /> <span aria-hidden="true">→</span></span>
          </Link>
          {sizeGuideJellyfish.map((jellyfish) => <span key={jellyfish.className} className={`size-guide-hero-jellyfish ${jellyfish.className}`} style={{ animationDelay: jellyfish.delay, animationDuration: jellyfish.duration }} aria-hidden="true"><JellyfishArtwork id={jellyfish.className.replaceAll(" ", "-")} tone={jellyfish.tone} direction={jellyfish.direction} /></span>)}
          <span className="size-guide-eyebrow"><LocalizedText translationKey="home.size.eyebrow" fallback="THE PONYO SIZE GUIDE" /></span>
          <h2><LocalizedText translationKey="home.size.title" fallback="How big is big?" /></h2>
          <p><LocalizedText translationKey="home.size.sub" fallback="From pocket pals to room-filling giants. Tap a size to shop it." /></p>
        </header>
          <div className="size-guide-tiles">
          <div className="size-guide-light" aria-hidden="true" />
          <div className="size-guide-mobile-jellyfish" aria-hidden="true">
            {sizeGuideJellyfish.slice(0, 3).map((jellyfish, index) => <span key={jellyfish.tone} className={`size-guide-hero-jellyfish size-guide-mobile-jellyfish--${index + 1}`} style={{ animationDelay: jellyfish.delay, animationDuration: jellyfish.duration }}><JellyfishArtwork id={`size-guide-mobile-${jellyfish.tone}`} tone={jellyfish.tone} direction={jellyfish.direction} /></span>)}
          </div>
          {[
            { name: "Small", range: "Under 25 cm", rangeKey: "under_25", image: images.chick, size: "Small" },
            { name: "Medium", range: "25–45 cm", rangeKey: "range_medium", image: images.bear, size: "Medium" },
            { name: "Large", range: "45–70 cm", rangeKey: "range_large", image: images.dog, size: "Large" },
            { name: "XL", range: "70 cm +", rangeKey: "range_xl", image: images.xlCat, size: "XL" },
          ].map((tile) => <Link className={`size-guide-tile size-guide-tile--${tile.name.toLowerCase()}`} href={`/collections/all?filter.p.m.ponyo.size_tier=${tile.size}`} key={tile.name}><span><Image src={tile.image} alt={t("home.size.image_alt", { size: t(`shop.size.${tile.name.toLowerCase()}`) })} fill sizes="(max-width: 640px) 30vw, 265px" /></span><strong><LocalizedText translationKey={`shop.size.${tile.name.toLowerCase()}`} fallback={tile.name} /></strong><small><LocalizedText translationKey={`home.size.${tile.rangeKey}`} fallback={tile.range} /></small></Link>)}
        </div>
        <Link className="size-guide-full-link" href="/size-guide"><LocalizedText translationKey="product.proof.size_guide" fallback="Explore the full size guide" /> <span aria-hidden="true">→</span></Link>
      </section>

      <section className="domina-band" id="domina">
        <div className="domina-band-copy"><span className="domina-eyebrow"><LocalizedText translationKey="home.domina.eyebrow" fallback="DOMINA BY PONYO" /></span><h2><LocalizedText translationKey="home.domina.title" fallback="Room for Something Extraordinary." /></h2><p><LocalizedText translationKey="home.domina.body" fallback="Meet Domina XL — oversized plush companions to bring comfort, character, and a little wonder into your space." /></p><Link href="/pages/domina-xl"><LocalizedText translationKey="home.domina.cta" fallback="Shop giant plush →" /></Link></div>
        <figure><div className="domina-band-image"><Image src="/images/catalog/ponyo-3.png" alt={t("home.image_alt.domina")} fill sizes="(max-width: 767px) 90vw, 560px"/></div><figcaption><LocalizedText translationKey="home.domina.caption" fallback="A plush with presence." /></figcaption></figure>
      </section>

      <ProductShelf className="home-live-shelf" id="domina-products" eyebrow="Big plush, memorable presence" title="XL Goodies" products={domina} href="/collections/domina-xl" linkLabel="See all →" />
      <ProductShelf className="home-live-shelf premium-picks" id="most-loved" eyebrow="Premium Picks" title="Premium Picks" description="A handpicked mix of distinctive faces, colors, and character." products={premium} href="/collections/premium" linkLabel="See all →" />

      <section className="quick-faq store-container">
        <header><div><h2><LocalizedText translationKey="home.faq.title" fallback="Quick answers" /></h2><p><LocalizedText translationKey="home.faq.sub" fallback="New to Ponyo? Here is what shoppers ask most." /></p></div><Link href="/pages/faq"><LocalizedText translationKey="home.faq.link" fallback="All FAQs →" /></Link></header>
        <div className="quick-faq-list">{faqRows.map(([questionKey, answerKey]) => <details key={questionKey}><summary><LocalizedText className="quick-faq-question" translationKey={`home.faq.${questionKey}`} fallback={faq[questionKey]} /><span className="quick-faq-toggle">+</span></summary><p><LocalizedText translationKey={`home.faq.${answerKey}`} fallback={faq[answerKey]} /></p></details>)}</div>
      </section>

    </SiteFrame>
  );
}
