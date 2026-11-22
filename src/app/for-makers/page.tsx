import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";
import { LocalizedText } from "@/components/layout/localization-provider";
import { MakerApplicationForm } from "@/components/makers/maker-application-form";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("static.maker.metadata.title"),
    description: t("static.maker.metadata.description"),
  };
}

const makerTests = [
  {
    number: "01",
    titleKey: "maker.for_makers.test.quality.title",
    title: "Quality we can show",
    descriptionKey: "maker.for_makers.test.quality.description",
    description: "Help us verify who makes your product and how it is made. Clear construction details, materials, and product photos let us tell the quality story honestly.",
    evidenceKey: "maker.for_makers.test.quality.evidence",
    evidence: "Maker identity · materials · construction",
  },
  {
    number: "02",
    titleKey: "maker.for_makers.test.demand.title",
    title: "Proven desire",
    descriptionKey: "maker.for_makers.test.demand.description",
    description: "Show signs that collectors are looking for your work. Examples could include a past sell-out, a waitlist, or documented resale above retail price.",
    evidenceKey: "maker.for_makers.test.demand.evidence",
    evidence: "Sales history · demand signals · supporting links",
  },
  {
    number: "03",
    titleKey: "maker.for_makers.test.discovery.title",
    title: "Not two clicks away",
    descriptionKey: "maker.for_makers.test.discovery.description",
    description: "We look for pieces that are not easy to find on large marketplaces or through common proxy-shopping routes. Share where the product is currently available.",
    evidenceKey: "maker.for_makers.test.discovery.evidence",
    evidence: "Current sales channels · regional availability",
  },
];

export default function ForMakersPage() {
  return <SiteFrame className="store-page for-makers-page">
    <section className="maker-hero store-container">
      <div className="maker-hero-copy">
        <p className="eyebrow"><LocalizedText translationKey="maker.for_makers.hero.eyebrow" fallback="WHY SELL WITH PONYO?" /></p>
        <h1><LocalizedText translationKey="maker.for_makers.hero.title_lead" fallback="For the hands" /><br /><LocalizedText translationKey="static.maker.title_connector" fallback="behind the" /> <em><LocalizedText translationKey="maker.for_makers.hero.title_accent" fallback="soft things." /></em></h1>
        <p><LocalizedText translationKey="maker.for_makers.hero.body" fallback="Ponyo is a curated home for exceptional plush and character makers. We introduce thoughtful creations to people who value the story and care behind them." /></p>
        <Link className="shop-button shop-button-orange" href="#maker-application"><LocalizedText translationKey="maker.for_makers.hero.cta" fallback="Share your work" /> <span aria-hidden="true">↓</span></Link>
      </div>
      <div className="maker-hero-art" aria-hidden="true">
        <span className="maker-orbit maker-orbit--one" />
        <span className="maker-orbit maker-orbit--two" />
        <span className="maker-hero-star">✦</span>
        <span className="maker-hero-star maker-hero-star--secondary">✧</span>
        <span className="maker-hero-sparkle maker-hero-sparkle--one">✦</span>
        <span className="maker-hero-sparkle maker-hero-sparkle--two">✧</span>
        <span className="maker-hero-sparkle maker-hero-sparkle--three">✦</span>
        <span className="maker-hero-sparkle maker-hero-sparkle--four">✧</span>
        <span className="maker-hero-sparkle maker-hero-sparkle--five">✦</span>
        <span className="maker-hero-sparkle maker-hero-sparkle--six">✧</span>
        <Image className="maker-hero-jellyfish" src="/ponyo-jellyfish.svg" alt="" width={72} height={72} />
        <span className="maker-hero-stamp"><LocalizedText translationKey="static.maker.stamp" fallback="MADE WITH INTENTION" /></span>
        <span className="maker-hero-caption"><LocalizedText translationKey="static.maker.caption" fallback="A place for your next chapter" /></span>
      </div>
    </section>

    <section className="maker-how store-container" aria-labelledby="maker-how-title">
      <header><p className="eyebrow"><LocalizedText translationKey="maker.for_makers.how.eyebrow" fallback="HOW PONYO WORKS" /></p><h2 id="maker-how-title"><LocalizedText translationKey="maker.for_makers.how.title" fallback="A clear path, made with care." /></h2><p><LocalizedText translationKey="maker.for_makers.how.intro" fallback="Every application is reviewed by the Ponyo team. These steps explain what to expect—not a promise of selection." /></p></header>
      <div className="maker-how-grid">
        <article><span>01</span><h3><LocalizedText translationKey="maker.for_makers.how.step1.title" fallback="Introduce your work" /></h3><p><LocalizedText translationKey="maker.for_makers.how.step1.body" fallback="Tell us about your studio, your product, and the people who make it." /></p></article>
        <article><span>02</span><h3><LocalizedText translationKey="maker.for_makers.how.step2.title" fallback="Share the proof" /></h3><p><LocalizedText translationKey="maker.for_makers.how.step2.body" fallback="Show verifiable materials, product details, customer interest, and where the piece is available." /></p></article>
        <article><span>03</span><h3><LocalizedText translationKey="maker.for_makers.how.step3.title" fallback="Thoughtful review" /></h3><p><LocalizedText translationKey="maker.for_makers.how.step3.body" fallback="We assess each application against our selection tests. Any future partnership terms are discussed separately." /></p></article>
      </div>
    </section>

    <section className="maker-screening store-container" aria-labelledby="maker-screening-title">
      <header><p className="eyebrow"><LocalizedText translationKey="maker.for_makers.tests.eyebrow" fallback="THREE QUESTIONS WE ASK" /></p><h2 id="maker-screening-title"><LocalizedText translationKey="maker.for_makers.tests.title" fallback="Our screening tests" /></h2><p><LocalizedText translationKey="maker.for_makers.tests.intro" fallback="These are review criteria, not claims about any applicant or product." /></p></header>
      <div className="maker-test-grid">{makerTests.map((test) => <article key={test.number}><span className="maker-test-number">{test.number}</span><div><h3><LocalizedText translationKey={test.titleKey} fallback={test.title} /></h3><p><LocalizedText translationKey={test.descriptionKey} fallback={test.description} /></p><small><LocalizedText translationKey={test.evidenceKey} fallback={test.evidence} /></small></div></article>)}</div>
    </section>

    <section className="maker-offer store-container" aria-labelledby="maker-offer-title">
      <header><p className="eyebrow"><LocalizedText translationKey="maker.for_makers.offer.eyebrow" fallback="WHAT MAKERS GET" /></p><h2 id="maker-offer-title"><LocalizedText translationKey="maker.for_makers.offer.title" fallback="A thoughtful stage for your work." /></h2><p><LocalizedText translationKey="maker.for_makers.offer.intro" fallback="We want makers to keep their creative voice and clear control over their products." /></p></header>
      <div className="maker-offer-grid">
        <article><span aria-hidden="true">✧</span><h3><LocalizedText translationKey="maker.for_makers.offer.discovery.title" fallback="Curated discovery" /></h3><p><LocalizedText translationKey="maker.for_makers.offer.discovery.body" fallback="A focused marketplace for exceptional soft things and the people looking for something special." /></p></article>
        <article><span aria-hidden="true">♡</span><h3><LocalizedText translationKey="maker.for_makers.offer.context.title" fallback="Your work, in context" /></h3><p><LocalizedText translationKey="maker.for_makers.offer.context.body" fallback="Space to introduce your studio, process, and the details that make a creation yours." /></p></article>
        <article><span aria-hidden="true">⌖</span><h3><LocalizedText translationKey="maker.for_makers.offer.fees.title" fallback="No upfront listing fees" /></h3><p><LocalizedText translationKey="maker.for_makers.offer.fees.body" fallback="There is no upfront fee to submit your work for consideration." /></p></article>
        <article><span aria-hidden="true">↗</span><h3><LocalizedText translationKey="maker.for_makers.offer.control.title" fallback="Control stays with you" /></h3><p><LocalizedText translationKey="maker.for_makers.offer.control.body" fallback="You retain control of your products and pricing. Any future partnership terms are agreed separately." /></p></article>
      </div>
    </section>

    <section className="maker-application-wrap" id="maker-application">
      <div className="maker-application-heading"><p className="eyebrow"><LocalizedText translationKey="maker.for_makers.application.eyebrow" fallback="YOUR WORK, IN YOUR WORDS" /></p><h2><LocalizedText translationKey="maker.for_makers.application.title" fallback="Start with an introduction." /></h2><p><LocalizedText translationKey="maker.for_makers.application.intro" fallback="Applications are reviewed by the Ponyo team. Submitting one does not guarantee selection or create a partnership." /></p></div>
      <MakerApplicationForm />
    </section>
  </SiteFrame>;
}
