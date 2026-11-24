import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ElementType, HTMLAttributes } from "react";
import { SiteFrame } from "@/components/layout/site-frame";
import { LocalContactForm } from "@/components/layout/local-store-forms";
import { LocalizedText } from "@/components/layout/localization-provider";
import { PartnerInquiryForm } from "@/components/layout/partner-inquiry-form";
import { ProductGrid } from "@/components/product/product-grid";
import { SortSelect } from "@/components/product/sort-select";
import { JellyfishArtwork } from "@/components/home/jellyfish-artwork";
import { PonyoSelect } from "@/components/ui/ponyo-select";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { isDominaXLProduct } from "@/lib/product-categories";
import locale from "@/locales/en.default.json";

const faq = locale.pg.faq;
const about = locale.pg.about;
const sizeRows = [
  ["small", "Small", "Under 25 cm", "/shop?filter.p.m.ponyo.size_tier=Small"],
  ["medium", "Medium", "25–45 cm", "/shop?filter.p.m.ponyo.size_tier=Medium"],
  ["large", "Large", "45–70 cm", "/shop?filter.p.m.ponyo.size_tier=Large"],
  ["xl", "XL", "70 cm +", "/shop?filter.p.m.ponyo.size_tier=XL"],
  ["giant", "Domina Giant", "100 cm +", "/shop?filter.p.m.ponyo.size_tier=Giant"],
] as const;
const dominaSortOptions = [
  { value: "featured", key: "sort_featured", label: "Featured" },
  { value: "title-ascending", key: "sort_title_asc", label: "Alphabetically, A–Z" },
  { value: "title-descending", key: "sort_title_desc", label: "Alphabetically, Z–A" },
  { value: "price-ascending", key: "sort_price_asc", label: "Price, low to high" },
  { value: "price-descending", key: "sort_price_desc", label: "Price, high to low" },
  { value: "created-ascending", key: "sort_created_asc", label: "Date, old to new" },
  { value: "created-descending", key: "sort_created_desc", label: "Date, new to old" },
];

const legalDrafts: Record<string, { title: string; subtitle: string; sections: Array<{ heading: string; body: string }> }> = {
  "specified-commercial-transactions-act-disclosure": {
    title: "Specified Commercial Transactions Act Disclosure",
    subtitle: "特定商取引法に基づく表記 · Draft for operational and legal review",
    sections: [
      { heading: "Business operator", body: "[Business operator's legal name — confirm before publication.] This disclosure is a draft and must be completed with the operator's verified details." },
      { heading: "Address and contact", body: "Business address: [Confirm before publication.] Telephone: [Confirm before publication.] Contact: [Publish a monitored contact method before accepting transactions.]" },
      { heading: "Price and additional charges", body: "Current product reservations are non-binding expressions of interest. No purchase price, shipping fee, tax, or other payment is collected for a reservation. Applicable prices and any additional charges must be stated before a future purchase is offered." },
      { heading: "Payment and delivery", body: "No payment method or delivery schedule applies to a reservation. Payment methods, delivery timing, and shipping charges for any future sale remain to be confirmed and must be disclosed before checkout is enabled." },
      { heading: "Cancellation and returns", body: "A reservation does not create an order and does not require payment. Cancellation instructions for reservations and any future cancellation, return, or refund terms must be confirmed and published before launch of a paid transaction." },
    ],
  },
  "privacy-policy": {
    title: "Privacy Policy",
    subtitle: "Draft describing reservation and maker-application information",
    sections: [
      { heading: "Information collected", body: "A reservation collects an email address, country, product reference, and reservation timestamp. A maker application collects maker and contact names, email, country and city, website or social links, product URL and description, evidence of customer demand, material and price-range details, submitted product photos, exclusivity information, and application status." },
      { heading: "How information is used", body: "Ponyo uses reservation details to record and count expressions of interest and to manage maker applications. An application is reviewed by the Ponyo team; submitting one does not guarantee selection or a partnership." },
      { heading: "Storage and retention", body: "Submitted information is stored in Ponyo's application database. Retention periods, hosting locations, backup practices, and deletion schedules must be confirmed and published before this draft is finalized." },
      { heading: "Sharing", body: "Before publication, Ponyo must identify any hosting, security, email, or other service providers that process this information, their purposes and locations, and any cross-border transfers. Do not publish this draft until those details are verified." },
      { heading: "Your choices and requests", body: "For access, correction, deletion, or questions about submitted information, contact Ponyo through the contact page. A monitored privacy contact and the process and timing for handling requests must be confirmed before publication." },
    ],
  },
  "terms-and-returns": {
    title: "Terms and Returns",
    subtitle: "Draft for the current no-payment reservation model",
    sections: [
      { heading: "Using this website", body: "Use the site lawfully and provide accurate information when submitting a reservation or maker application. Product information may be incomplete while maker details are being verified." },
      { heading: "Reservations are not purchases", body: "A reservation records interest in a product only. It is non-binding, does not create an order or guarantee availability, and does not collect payment. Reservation counts describe recorded submissions and are not a purchase commitment or promise of production." },
      { heading: "Canceling a reservation", body: "A reservation may be canceled by contacting Ponyo through the contact page and identifying the product and email used. The cancellation workflow and a monitored contact address must be confirmed before launch; no payment is due or refunded for a reservation." },
      { heading: "Future purchases, returns, and refunds", body: "Paid transactions, payment methods, delivery terms, statutory disclosures, cancellation rights, returns, and refunds are not part of the current reservation flow. Ponyo must publish final terms before enabling checkout or collecting payment." },
      { heading: "Draft status", body: "This document is not final legal advice. Review it with legal professionals familiar with Japanese and Korean requirements, and confirm the applicable governing law and consumer disclosures before publication." },
    ],
  },
  "terms-of-service": {
    title: "Terms of Service",
    subtitle: "Draft for the current no-payment reservation model",
    sections: [
      { heading: "Using this website", body: "Use the site lawfully and provide accurate information when submitting a reservation or maker application. Product information may be incomplete while maker details are being verified." },
      { heading: "Reservations are not purchases", body: "A reservation records interest in a product only. It is non-binding, does not create an order or guarantee availability, and does not collect payment. Reservation counts describe recorded submissions and are not a purchase commitment or promise of production." },
      { heading: "Canceling a reservation", body: "A reservation may be canceled by contacting Ponyo through the contact page and identifying the product and email used. The cancellation workflow and a monitored contact address must be confirmed before launch; no payment is due or refunded for a reservation." },
      { heading: "Future purchases", body: "Paid transactions, payment methods, delivery terms, statutory disclosures, and cancellation rights are not part of the current reservation flow. Ponyo must publish final terms before enabling checkout or collecting payment." },
      { heading: "Draft status", body: "This document is not final legal advice. Review it with legal professionals familiar with Japanese and Korean requirements, and confirm the applicable governing law and consumer disclosures before publication." },
    ],
  },
  "returns-policy": {
    title: "Returns and Refunds",
    subtitle: "Draft — paid purchases are not available in the current reservation flow",
    sections: [
      { heading: "Current reservations", body: "A reservation records interest only. It is not a purchase, no payment is collected, and no refund applies to a reservation." },
      { heading: "Canceling a reservation", body: "A reservation may be canceled by contacting Ponyo through the contact page and identifying the product and email used. Confirm a monitored contact method and the cancellation workflow before publication." },
      { heading: "Future paid orders", body: "No returns or refund terms for paid purchases are active in the current no-payment reservation flow. Before checkout or payment is enabled, Ponyo must publish a complete policy that reflects its actual operations and applicable consumer rights." },
      { heading: "Draft status", body: "This document is not final legal advice. Review it with legal professionals familiar with Japanese and Korean requirements before publication." },
    ],
  },
};

const faqGroups = [
  { id: "ordering", title: faq.ordering_title, questions: [["ordering_q1", faq.ordering_q1, "ordering_a1", faq.ordering_a1], ["ordering_q2", faq.ordering_q2, "ordering_a2", faq.ordering_a2], ["ordering_q3", faq.ordering_q3, "ordering_a3", faq.ordering_a3]] },
  { id: "shipping", title: faq.shipping_title, questions: [["shipping_q1", faq.shipping_q1, "shipping_a1", faq.shipping_a1], ["shipping_q2", faq.shipping_q2, "shipping_a2", faq.shipping_a2], ["shipping_q3", faq.shipping_q3, "shipping_a3", faq.shipping_a3], ["shipping_q4", faq.shipping_q4, "shipping_a4", faq.shipping_a4]] },
  { id: "sizes", title: faq.sizes_title, questions: [["sizes_q1", faq.sizes_q1, "sizes_a1", faq.sizes_a1], ["sizes_q2", faq.sizes_q2, "sizes_a2", faq.sizes_a2], ["sizes_q3", faq.sizes_q3, "sizes_a3", faq.sizes_a3]] },
  { id: "care", title: faq.care_title, questions: [["care_q1", faq.care_q1, "care_a1", faq.care_a1], ["care_q2", faq.care_q2, "care_a2", faq.care_a2]] },
  { id: "help", title: faq.help_title, questions: [["help_q1", faq.help_q1, "help_a1", faq.help_a1], ["help_q2", faq.help_q2, "help_a2", faq.help_a2], ["help_q3", faq.help_q3, "help_a3", faq.help_a3]] },
];

function PageCopy({ id, fallback, as, htmlId, values, ...props }: { id: string; fallback: string; as?: ElementType; htmlId?: string; values?: Record<string, string | number> } & HTMLAttributes<HTMLElement>) {
  return <LocalizedText translationKey={`pages.${id}`} fallback={fallback} as={as} id={htmlId} values={values} {...props} />;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations();
  if (slug === "faq") return { title: t("pages.faq.title"), description: t("pages.faq.sub") };
  if (slug === "about") return { title: t("pages.about.title"), description: t("pages.about.intro") };
  if (slug === "domina-xl") return { title: t("pages.domina.metadata_title"), description: t("pages.domina.metadata_body") };
  if (slug === "contact") return { title: t("contact.title") };
  if (slug === "partners") return { title: t("pages.partner.title"), description: t("pages.partner.body") };
  if (legalDrafts[slug]) return { title: `${legalDrafts[slug].title} · Ponyo`, description: legalDrafts[slug].subtitle };
  return { title: "Ponyo" };
}

function LegalDraftPage({ draft, slug }: { draft: (typeof legalDrafts)[string]; slug: string }) {
  return <SiteFrame className="store-page legal-draft-page">
    <article className="legal-draft store-container">
      <header><p className="eyebrow"><LocalizedText translationKey="legal.draft.eyebrow" fallback="PONYO · POLICY DRAFT" /></p><h1><LocalizedText translationKey={`legal.${slug}.title`} fallback={draft.title} /></h1><p><LocalizedText translationKey={`legal.${slug}.subtitle`} fallback={draft.subtitle} /></p><strong className="legal-draft-warning"><LocalizedText translationKey="legal.draft.warning" fallback="DRAFT — confirm business details and obtain legal review before publication." /></strong></header>
      <div>{draft.sections.map((section, index) => <section key={section.heading}><h2><LocalizedText translationKey={`legal.${slug}.section.${index + 1}.heading`} fallback={section.heading} /></h2><p><LocalizedText translationKey={`legal.${slug}.section.${index + 1}.body`} fallback={section.body} /></p></section>)}</div>
      <p className="legal-draft-contact"><LocalizedText translationKey="legal.draft.questions" fallback="Questions?" /> <Link href="/pages/contact"><LocalizedText translationKey="legal.draft.contact" fallback="Contact Ponyo" /></Link>.</p>
    </article>
  </SiteFrame>;
}

async function AboutPage() {
  const t = await getTranslations();
  return <>
    <section className="content-page store-container about-page">
      <div className="about-hero"><div><span className="about-eyebrow"><PageCopy id="about.eyebrow" fallback={about.eyebrow} /></span><h1><PageCopy as="span" id="about.heading" fallback={about.heading} /> <em><PageCopy as="span" id="about.heading_accent" fallback={about.heading_accent} /></em></h1><p><PageCopy as="span" id="about.intro" fallback={about.intro} /></p><p><PageCopy as="span" id="about.intro2" fallback={about.intro2} /></p><div className="about-actions"><Link className="shop-button shop-button-orange" href="/shop"><PageCopy id="about.cta_shop" fallback={about.cta_shop} /></Link><Link className="about-secondary-button" href="/pages/domina-xl"><PageCopy id="about.cta_domina" fallback={about.cta_domina} /></Link></div></div><Image src="/images/catalog/ponyo-5.png" alt={t("pages.about.image_alt")} width={600} height={700} priority /></div>
      <h2 className="about-section-title"><PageCopy id="about.promise_title" fallback={about.promise_title} /></h2><div className="about-promise-grid">{[["v1", about.v1_title, about.v1_body, "♡"], ["v2", about.v2_title, about.v2_body, "⌕"], ["v3", about.v3_title, about.v3_body, "↕"]].map(([key, title, body, icon]) => <article key={key}><span>{icon}</span><h3><PageCopy id={`about.${key}_title`} fallback={title} /></h3><p><PageCopy as="span" id={`about.${key}_body`} fallback={body} /></p></article>)}</div>
      <h2 className="about-section-title"><PageCopy id="about.size_title" fallback="Shop by size" /></h2><div className="about-size-grid">{sizeRows.map(([key, name, range, href]) => <Link href={href} key={key}><strong><PageCopy id={key === "giant" ? "domina.size_domina_giant" : `domina.size_${key}`} fallback={name} /></strong><span><PageCopy id={`domina.range_${key}`} fallback={range} /></span></Link>)}</div>
      <section className="about-closing"><h2><PageCopy id="about.closing_title" fallback={about.closing_title} /></h2><p><PageCopy as="span" id="about.closing_body" fallback={about.closing_body} /></p><Link className="shop-button shop-button-orange" href="/shop"><PageCopy id="about.cta_shop" fallback={about.cta_shop} /></Link></section>
    </section>
  </>;
}

function FaqPage() {
  return <div className="faq-page">
    <header className="faq-page-header">
      <div className="faq-hero-copy">
        <span className="faq-eyebrow"><span aria-hidden="true">✦</span> <PageCopy id="faq.hero_eyebrow" fallback="THE PONYO HELP STUDIO" /></span>
        <h1><PageCopy as="span" id="faq.title" fallback={faq.title} /><span className="faq-title-mark" aria-hidden="true">?</span></h1>
        <p><PageCopy as="span" id="faq.sub" fallback={faq.sub} /></p>
        <nav aria-labelledby="faq-topic-nav-label"><PageCopy as="span" id="faq.topics" fallback={faq.topics} className="sr-only" htmlId="faq-topic-nav-label" />{faqGroups.map((group) => <a href={`#faq-${group.id}`} key={group.id}><span className="faq-topic-nav-icon" aria-hidden="true"><FaqIcon name={group.id} /></span><PageCopy id={`faq.${group.id}_title`} fallback={group.title} /><span className="faq-nav-arrow" aria-hidden="true">↗</span></a>)}</nav>
      </div>
      <div className="faq-hero-art" aria-hidden="true">
        <span className="faq-art-orbit faq-art-orbit--one" />
        <span className="faq-art-orbit faq-art-orbit--two" />
        <span className="faq-art-spark faq-art-spark--one">✦</span>
        <span className="faq-art-spark faq-art-spark--two">✧</span>
        <span className="faq-art-centerpiece"><JellyfishArtwork id="faq-hero-center" tone="gold" direction={1} /></span>
        <span className="faq-art-icon"><FaqIcon name="help" /></span>
        <span className="faq-jellyfish faq-jellyfish--gold"><JellyfishArtwork id="faq-hero-gold" tone="gold" direction={1} /></span>
        <span className="faq-jellyfish faq-jellyfish--gold-secondary"><JellyfishArtwork id="faq-hero-gold-secondary" tone="gold" direction={-1} /></span>
        <span className="faq-art-caption"><PageCopy id="faq.hero_art" fallback="A little help, a lot of heart." /></span>
      </div>
    </header>
    <div className="faq-page-content store-container">
      <div className="faq-service-notes" aria-labelledby="faq-service-label">
      <PageCopy as="span" id="faq.service_aria" fallback="Helpful shopping information" className="sr-only" htmlId="faq-service-label" />
      <article><span aria-hidden="true"><FaqIcon name="package" /></span><div><strong><PageCopy id="faq.packing" fallback="Thoughtful packing" /></strong><small><PageCopy as="span" id="faq.packing_body" fallback="Every plush is prepared with care." /></small></div></article>
      <article><span aria-hidden="true"><FaqIcon name="pin" /></span><div><strong><PageCopy id="faq.delivery" fallback="Delivery, your way" /></strong><small><PageCopy as="span" id="faq.delivery_body" fallback="Options appear for your address at checkout." /></small></div></article>
      <article><span aria-hidden="true"><FaqIcon name="sparkle" /></span><div><strong><PageCopy id="faq.support" fallback="Here when you need us" /></strong><small><PageCopy as="span" id="faq.support_body" fallback="Our team is happy to help." /></small></div></article>
    </div>
    <div className="faq-page-groups">{faqGroups.map((group) => <section id={`faq-${group.id}`} key={group.id} className={`faq-topic faq-topic--${group.id}`}>
      <div className="faq-topic-heading"><span className="faq-topic-icon" aria-hidden="true"><FaqIcon name={group.id} /></span><div><span className="faq-topic-kicker"><PageCopy id="faq.guide_number" fallback="PONYO GUIDE · {{number}}" values={{ number: String(faqGroups.indexOf(group) + 1).padStart(2, "0") }} /></span><h2><PageCopy id={`faq.${group.id}_title`} fallback={group.title} /></h2></div><span className="faq-question-count"><PageCopy id="faq.answers" fallback="{{count}} answers" values={{ count: group.questions.length }} /></span></div>
      {group.id === "shipping" && <div className="shipping-journey" aria-labelledby="faq-shipping-journey-label">
        <PageCopy as="span" id="faq.shipping_journey_aria" fallback="How delivery information works" className="sr-only" htmlId="faq-shipping-journey-label" />
        <article><span className="shipping-step-number">01</span><span className="shipping-step-icon" aria-hidden="true"><FaqIcon name="tag" /></span><div><strong><PageCopy id="faq.choose_plush" fallback="Choose your plush" /></strong><small><PageCopy as="span" id="faq.choose_plush_body" fallback="Check the dispatch time on its product page." /></small></div></article>
        <span className="shipping-journey-connector" aria-hidden="true">······›</span>
        <article><span className="shipping-step-number">02</span><span className="shipping-step-icon" aria-hidden="true"><FaqIcon name="pin" /></span><div><strong><PageCopy id="faq.delivery_options" fallback="See delivery options" /></strong><small><PageCopy as="span" id="faq.delivery_options_body" fallback="Enter your address to see availability and exact cost." /></small></div></article>
        <span className="shipping-journey-connector" aria-hidden="true">······›</span>
        <article><span className="shipping-step-number">03</span><span className="shipping-step-icon" aria-hidden="true"><FaqIcon name="package" /></span><div><strong><PageCopy id="faq.follow_order" fallback="Follow your order" /></strong><small><PageCopy as="span" id="faq.follow_order_body" fallback="We email a dispatch update, with tracking when available." /></small></div></article>
      </div>}
      <div className="faq-topic-questions">{group.questions.map(([questionKey, question, answerKey, answer], index) => <details key={questionKey} open={group.id === "ordering" && index === 0}><summary><span className="faq-question-text"><PageCopy as="span" id={`faq.${questionKey}`} fallback={question} /></span><span className="faq-toggle" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></span></summary><p><PageCopy as="span" id={`faq.${answerKey}`} fallback={answer} /></p></details>)}</div>
      {group.id === "sizes" && <div className="faq-size-table"><table><caption className="sr-only"><PageCopy as="span" id="faq.size_ranges" fallback="Ponyo plush size ranges" /></caption><tbody>{sizeRows.map(([key, name, range]) => <tr key={key}><th scope="row"><PageCopy id={key === "giant" ? "domina.size_domina_giant" : `domina.size_${key}`} fallback={name} /></th><td><PageCopy id={`domina.range_${key}`} fallback={range} /></td></tr>)}</tbody></table></div>}
    </section>)}</div>
    <section className="faq-contact-cta"><h2><PageCopy id="faq.contact_title" fallback={faq.contact_title} /></h2><p><PageCopy as="span" id="faq.contact_body" fallback={faq.contact_body} /></p><Link className="shop-button shop-button-orange" href="/pages/contact"><PageCopy id="faq.contact_cta" fallback={faq.contact_cta} /></Link></section>
    </div>
  </div>;
}

function FaqIcon({ name }: { name: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.65, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "ordering" || name === "package") return <svg {...common}><path d="m3.5 7 8.5-4 8.5 4v10L12 21l-8.5-4V7Z"/><path d="m3.8 7.2 8.2 4 8.2-4M12 11.2V21M8 5l8.2 4"/></svg>;
  if (name === "shipping" || name === "pin") return <svg {...common}><path d="M3 6.5h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/><path d="M17 10v3h4"/></svg>;
  if (name === "sizes" || name === "tag") return <svg {...common}><path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8" cy="8" r="1.2"/><path d="M13 7v4M11 9h4"/></svg>;
  if (name === "care" || name === "sparkle") return <svg {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 3l.7 1.8L7.5 5.5l-1.8.7L5 8l-.7-1.8-1.8-.7 1.8-.7L5 3Z"/></svg>;
  return <svg {...common}><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M9.7 9a2.3 2.3 0 1 1 3.8 1.7c-1 .9-1.5 1.2-1.5 2.3M12 15.8h.01"/></svg>;
}

async function ContactPage() {
  const t = await getTranslations();
  return <div className="store-container contact-page contact-page--studio">
    <section className="contact-hero" aria-labelledby="contact-title">
      <Image
        className="contact-hero-image"
        src="/images/contact-support-hero.png"
        alt={t("pages.contact.hero_image_alt")}
        fill
        priority
        sizes="(max-width: 1200px) 100vw, 1200px"
      />
      <div className="contact-hero-content">
        <span className="contact-hero-kicker"><span aria-hidden="true">✦</span> <LocalizedText translationKey="contact.hero_eyebrow" fallback="THE PONYO TEAM, ALWAYS CLOSE BY" /></span>
        <h1 id="contact-title"><LocalizedText translationKey="contact.hero_title" fallback="Thoughtful help, from our world to yours." /></h1>
        <p><LocalizedText translationKey="contact.hero_body" fallback="From choosing a new companion to checking on an order or exploring a partnership, we’re here to listen." /></p>
        <div className="contact-hero-actions">
          <a className="contact-hero-button contact-hero-button--light" href="#contact-options"><LocalizedText translationKey="contact.hero_options" fallback="Explore contact options" /> <span aria-hidden="true">↓</span></a>
          <a className="contact-hero-button contact-hero-button--quiet" href="#contact-form"><LocalizedText translationKey="contact.hero_message" fallback="Send us a note" /> <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <span className="contact-wind-vortex contact-wind-vortex--hero" aria-hidden="true"><i /><i /><i /></span>
      <span className="contact-hero-seal" aria-hidden="true">PONYO <span>♡</span> CARE</span>
    </section>

    <section className="contact-channel-section" id="contact-options" aria-labelledby="contact-channels-title">
      <div className="contact-channel-heading">
        <div>
          <p className="contact-channel-eyebrow"><LocalizedText translationKey="contact.channels_eyebrow" fallback="HERE WHEN YOU NEED US" /></p>
          <h2 id="contact-channels-title"><LocalizedText translationKey="contact.channels_title" fallback="A direct line to the right team." /></h2>
        </div>
        <p><LocalizedText translationKey="contact.channels_body" fallback="Choose the way that feels right. Every little note helps us make Ponyo feel more personal." /></p>
      </div>
      <div className="contact-channel-grid">
        <a className="contact-channel-card" href="mailto:hello@byponyo.com">
          <span className="contact-channel-icon" aria-hidden="true">✉</span>
          <span className="contact-channel-label"><LocalizedText translationKey="contact.email_general_title" fallback="Everyday questions" /></span>
          <small><LocalizedText translationKey="contact.email_general_body" fallback="Questions, ideas, or simply a hello." /></small>
          <b>hello@byponyo.com <span aria-hidden="true">↗</span></b>
        </a>
        <a className="contact-channel-card" href="mailto:support@byponyo.com">
          <span className="contact-channel-icon" aria-hidden="true">♡</span>
          <span className="contact-channel-label"><LocalizedText translationKey="contact.email_support_title" fallback="Orders & customer care" /></span>
          <small><LocalizedText translationKey="contact.email_support_body" fallback="Order updates, delivery, and product help." /></small>
          <b>support@byponyo.com <span aria-hidden="true">↗</span></b>
        </a>
        <a className="contact-channel-card" href="mailto:partners@byponyo.com">
          <span className="contact-channel-icon" aria-hidden="true">✧</span>
          <span className="contact-channel-label"><LocalizedText translationKey="contact.email_partners_title" fallback="Makers & partnerships" /></span>
          <small><LocalizedText translationKey="contact.email_partners_body" fallback="Maker stories, partnerships, and collaborations." /></small>
          <b>partners@byponyo.com <span aria-hidden="true">↗</span></b>
        </a>
        <a className="contact-channel-card" href="tel:+817091606676">
          <span className="contact-channel-icon" aria-hidden="true">☎</span>
          <span className="contact-channel-label"><LocalizedText translationKey="contact.phone_title" fallback="Call the Ponyo team" /></span>
          <small><LocalizedText translationKey="contact.phone_body" fallback="Prefer a conversation? Give us a call." /></small>
          <b>+81 70 9160 6676 <span aria-hidden="true">↗</span></b>
        </a>
      </div>
    </section>

    <div className="contact-promo-ribbon" aria-hidden="true">
      <div className="contact-promo-track">
        {Array.from({ length: 2 }, (_, index) => <span className="contact-promo-group" key={index}>
          <span><LocalizedText translationKey="contact.care_eyebrow" fallback="A LITTLE PONYO POSTCARD" /></span>
          <i>✦</i>
          <span><LocalizedText translationKey="contact.channels_eyebrow" fallback="HERE WHEN YOU NEED US" /></span>
          <i>✧</i>
          <span><LocalizedText translationKey="contact.team" fallback="Real people. Thoughtful help." /></span>
          <i>✦</i>
        </span>)}
      </div>
    </div>

    <div className="contact-studio-layout">
      <section className="contact-studio-intro" aria-labelledby="contact-intro-title">
        <span className="contact-studio-eyebrow"><span aria-hidden="true">✦</span> <LocalizedText translationKey="contact.eyebrow" fallback="A LITTLE HELP, A LOT OF HEART" /></span>
        <h2 id="contact-intro-title"><LocalizedText translationKey="contact.title" fallback="How can we help?" /></h2>
        <p className="contact-studio-lead"><LocalizedText translationKey="contact.intro" fallback="Questions about an order, delivery, or finding a plush? You’re in the right place." /></p>
        <div className="contact-team-note"><span className="contact-mascot" aria-hidden="true"><Image src="/ponyo-jellyfish.svg" alt="" width={64} height={64} /></span><div><h2><LocalizedText translationKey="contact.team" fallback="Real people. Thoughtful help." /></h2><p><LocalizedText translationKey="contact.team_body" fallback="Send the Ponyo team a note. We’ll reply to the email address you share." /></p></div></div>
        <div className="contact-help-links">
          <Link href="/pages/faq"><span className="contact-help-icon" aria-hidden="true">?</span><span><strong><LocalizedText translationKey="contact.faq" fallback="A quick answer might be waiting" /></strong><small><LocalizedText translationKey="contact.faq_body" fallback="Explore delivery, sizing, and care in our FAQs." /></small><b><LocalizedText translationKey="contact.faq_cta" fallback="Explore FAQs" /> <span aria-hidden="true">↗</span></b></span></Link>
        </div>
      </section>
      <div className="contact-form-anchor" id="contact-form"><LocalContactForm /></div>
    </div>

    <section className="contact-care-scene" aria-labelledby="contact-care-title">
      <div className="contact-care-inner">
        <div className="contact-care-copy">
          <p className="contact-care-eyebrow"><LocalizedText translationKey="contact.care_eyebrow" fallback="A LITTLE PONYO POSTCARD" /></p>
          <h2 id="contact-care-title"><LocalizedText translationKey="contact.care_title" fallback="A little note is always welcome." /></h2>
          <p><LocalizedText translationKey="contact.care_body" fallback="Share a question, a story, or a hello. Our little crew is here to make it feel personal." /></p>
          <div className="contact-care-actions">
            <a href="mailto:hello@byponyo.com"><LocalizedText translationKey="contact.care_email" fallback="Email Ponyo" /> <span aria-hidden="true">↗</span></a>
            <a href="tel:+817091606676"><LocalizedText translationKey="contact.care_phone" fallback="Call our team" /> <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="contact-care-art" aria-hidden="true">
          <span className="contact-care-star contact-care-star--one">✦</span>
          <span className="contact-care-star contact-care-star--two">✧</span>
          <span className="contact-care-star contact-care-star--three">✦</span>
          <span className="contact-care-star contact-care-star--four">✧</span>
          <span className="contact-care-orbit" />
          <div className="contact-care-jellyfish contact-care-jellyfish--friend"><Image src="/ponyo-jellyfish.svg" alt="" width={126} height={126} /></div>
          <div className="contact-care-jellyfish contact-care-jellyfish--main"><Image src="/ponyo-jellyfish.svg" alt="" width={214} height={214} /></div>
          <span className="contact-care-bubble contact-care-bubble--phone">☎</span>
          <span className="contact-care-bubble contact-care-bubble--email">✉</span>
          <span className="contact-care-note"><PageCopy id="contact.care_note" fallback="always here to listen" /> <span>♡</span></span>
        </div>
      </div>
      </section>
  </div>;
}

function PartnerPage() {
  return (
    <div className="store-container contact-page partner-page">
      <section className="partner-page-hero">
        <span className="account-auth-eyebrow"><PageCopy id="partner.eyebrow" fallback="MADE FOR FOREVER PLUSH" /></span>
        <h1><PageCopy as="span" id="partner.title" fallback="Let’s make room for your creations." /></h1>
        <p><PageCopy as="span" id="partner.body" fallback="We partner with thoughtful plush makers and character brands. Tell us about your work and what you have in mind." /></p>
      </section>
      <section className="partner-page-content" aria-labelledby="partner-form-title">
        <div className="partner-page-note">
          <h2 id="partner-form-title"><PageCopy as="span" id="partner.form_title" fallback="Start a conversation" /></h2>
          <p><PageCopy as="span" id="partner.form_body" fallback="Share your product range, studio, and partnership idea. Your inquiry is saved directly to Ponyo’s local system." /></p>
          <ul><li><PageCopy as="span" id="partner.point1" fallback="Independent makers and established brands welcome" /></li><li><PageCopy as="span" id="partner.point2" fallback="Limited editions and distinctive characters are a plus" /></li><li><PageCopy as="span" id="partner.point3" fallback="Include a website or social link so we can see your work" /></li></ul>
        </div>
        <PartnerInquiryForm />
      </section>
      <p className="partner-portal-sign-in"><PageCopy as="span" id="partner.existing" fallback="Already working with Ponyo?" /> <Link href="/supplier-portal"><PageCopy id="partner.supplier" fallback="Open your supplier studio ↗" /></Link></p>
    </div>
  );
}

type Query = Record<string, string | string[] | undefined>;
const firstQueryValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

async function DominaPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const t = await getTranslations();
  const localizedSortOptions = dominaSortOptions.map((option) => ({ ...option, label: t(`pages.domina.${option.key}`) }));
  const minimumParam = firstQueryValue(query.min)?.trim();
  const maximumParam = firstQueryValue(query.max)?.trim();
  const minimumValue = Number(minimumParam);
  const maximumValue = Number(maximumParam);
  const minimum = minimumParam && Number.isFinite(minimumValue) ? Math.max(0, minimumValue) : 0;
  const maximum = maximumParam && Number.isFinite(maximumValue) ? Math.max(0, maximumValue) : Number.POSITIVE_INFINITY;
  const size = firstQueryValue(query.size) ?? "";
  const availability = firstQueryValue(query["filter.v.availability"]) ?? "";
  const sort = firstQueryValue(query.sort_by) ?? "featured";
  const allProducts = (await getLocalizedProducts("limit=100")).filter(isDominaXLProduct);
  const products = allProducts.filter((product) => {
    const productSize = (product.sizeTier ?? product.size ?? "").toLowerCase();
    const sizeMatches = !size || productSize.startsWith(size.toLowerCase());
    return product.priceAmount >= minimum && product.priceAmount <= maximum && sizeMatches && (!availability || availability !== "1" || product.availability === "available");
  }).sort((a, b) => {
    const publishedAtA = Date.parse(a.publishedAt ?? "") || 0;
    const publishedAtB = Date.parse(b.publishedAt ?? "") || 0;
    if (sort === "price-ascending") return a.priceAmount - b.priceAmount;
    if (sort === "price-descending") return b.priceAmount - a.priceAmount;
    if (sort === "title-descending") return b.name.localeCompare(a.name);
    if (sort === "title-ascending") return a.name.localeCompare(b.name);
    if (sort === "created-ascending") return publishedAtA - publishedAtB;
    if (sort === "created-descending") return publishedAtB - publishedAtA;
    return 0;
  });
  const preservedFilters = {
    ...(size ? { size } : {}),
    ...(minimum ? { min: String(minimum) } : {}),
    ...(Number.isFinite(maximum) ? { max: String(maximum) } : {}),
    ...(availability ? { "filter.v.availability": availability } : {}),
  };
  return <div className="domina-page">
    <section className="domina-page-hero">
      <div className="domina-hero-glints" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index}>
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 1.5 14.8 9.2 22.5 12l-7.7 2.8L12 22.5l-2.8-7.7L1.5 12l7.7-2.8L12 1.5Z" />
            </svg>
          </span>
        ))}
      </div>
      <div className="domina-page-hero-copy">
        <span className="domina-hero-kicker"><span aria-hidden="true">✦</span> <PageCopy id="domina.hero_eyebrow" fallback="PONYO SIGNATURE COLLECTION" /> <span aria-hidden="true">✦</span></span>
        <h1><PageCopy as="span" id="domina.title" fallback="Domina XL" /></h1>
        <p><PageCopy as="span" id="domina.hero_body" fallback="Meet the plush that makes every room feel a little more magical. Big on softness, unmistakably Ponyo." /></p>
        <div className="domina-hero-facts"><span><strong>60–120 cm</strong><small><PageCopy as="span" id="domina.giant_hugs" fallback="made for giant hugs" /></small></span><i aria-hidden="true">✦</i><span><strong><PageCopy as="span" id="domina.one_of_a_kind" fallback="One-of-a-kind" /></strong><small><PageCopy as="span" id="domina.favorite_company" fallback="your new favorite company" /></small></span></div>
        <Link className="domina-hero-cta" href="#domina-products"><PageCopy id="domina.cta" fallback="Meet your giant plush" /> <span aria-hidden="true">↘</span></Link>
      </div>
      <div className="domina-hero-seal" role="img" aria-labelledby="domina-seal-label"><PageCopy as="span" id="domina.seal_aria" fallback="Ponyo Signature XL edition" className="sr-only" htmlId="domina-seal-label" /><span>THE PONYO</span><strong>XL</strong><span>SIGNATURE EDITION</span></div>
      <div className="domina-hero-media"><Image src="/images/catalog/ponyo-3.png" alt={t("pages.domina.image_alt")} fill priority sizes="(max-width: 767px) 100vw, 60vw" /></div>
      <span className="domina-jellyfish domina-jellyfish--hero" aria-hidden="true"><JellyfishArtwork id="domina-hero-gold" tone="gold" direction={1} /></span>
    </section>
    <section className="domina-trust store-container" aria-labelledby="domina-details-label"><PageCopy as="span" id="domina.details_aria" fallback="Domina XL details" className="sr-only" htmlId="domina-details-label" />{[["scale", "↕", "See the scale", "Every listing shows its full height, so you can picture it at home."], ["details", "♡", "Product details", "Clear size, materials and care details on every plush."], ["compare", "¥", "Compare prices", "Compare prices in your currency before checkout."], ["delivery", "↗", "Delivery info", "See XL delivery options and estimates for your destination."]].map(([key, icon, title, text]) => <article key={key}><span>{icon}</span><h2><PageCopy as="span" id={`domina.${key}_title`} fallback={title} /></h2><p><PageCopy as="span" id={`domina.${key}_body`} fallback={text} /></p></article>)}</section>
    <section className="store-container domina-products" id="domina-products">
      <header className="domina-products-heading">
        <svg className="domina-editorial-frame" viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M28 10H772Q790 10 790 28V272Q790 290 772 290H28Q10 290 10 272V28Q10 10 28 10Z" fill="#2b1b15" stroke="#c9a65f" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>
        <div><p className="eyebrow"><PageCopy id="domina.catalog_eyebrow" fallback="THE PONYO XL EDITION" /></p><h2><PageCopy as="span" id="domina.catalog_title" fallback="XL Goodies" /></h2></div>
        <p><PageCopy as="span" id="domina.catalog_body" fallback="Extra-large plush, chosen for their extra-large place in your heart." /></p>
        <span className="domina-jellyfish domina-jellyfish--gold" aria-hidden="true"><JellyfishArtwork id="domina-catalog-gold" tone="gold" direction={-1} /></span>
        <span className="domina-jellyfish domina-jellyfish--silver" aria-hidden="true"><JellyfishArtwork id="domina-catalog-pearl" tone="gold" direction={1} /></span>
      </header>
      <div className="domina-catalog-toolbar">
        <form className="domina-catalog-filters" action="/pages/domina-xl" method="get" aria-labelledby="domina-filter-label">
          <PageCopy as="span" id="domina.filter_aria" fallback="Filter XL plush" className="sr-only" htmlId="domina-filter-label" />
          <input type="hidden" name="sort_by" value={sort} />
          <label className="domina-size-filter" htmlFor="domina-size-filter"><PageCopy as="span" id="domina.size" fallback="Size" /><PonyoSelect
            id="domina-size-filter"
            name="size"
            defaultValue={size}
            label={t("pages.domina.size")}
            options={[
              { value: "", label: t("pages.domina.any_size") },
              ...["Small", "Medium", "Large", "XL", "Giant"].map((tier) => ({
                value: tier,
                label: t(`pages.domina.size_${tier.toLowerCase()}`),
              })),
            ]}
          /></label>
          <label><PageCopy as="span" id="domina.price_from" fallback="Price from ¥" /><input type="number" name="min" min="0" inputMode="numeric" defaultValue={minimum || ""} placeholder="0" /></label>
          <label><PageCopy as="span" id="domina.price_to" fallback="To ¥" /><input type="number" name="max" min="0" inputMode="numeric" defaultValue={Number.isFinite(maximum) ? maximum : ""} placeholder="No limit" /></label>
          <label className="domina-stock-filter"><input type="checkbox" name="filter.v.availability" value="1" defaultChecked={availability === "1"} /><PageCopy as="span" id="domina.in_stock" fallback="In stock only" /></label>
          <button type="submit"><PageCopy id="domina.show_results" fallback="Show results" /> <span aria-hidden="true">→</span></button>
        </form>
        <div className="domina-catalog-results">
          <span className="domina-catalog-count" role="status"><PageCopy id={products.length === 1 ? "domina.count_one" : "domina.count_other"} fallback={products.length === 1 ? "{{count}} plush" : "{{count}} plushies"} values={{ count: products.length }} /></span>
          <SortSelect action="/pages/domina-xl" value={sort} category="" search="" preservedFilters={preservedFilters} options={localizedSortOptions} />
        </div>
      </div>
      <ProductGrid products={products} fillSlots={products.length > 0} fillColumns={[2, 3, 4, 4]} promoCount={2} />
      {products.length === 0 && <p className="empty-collection"><PageCopy as="span" id="domina.no_matches" fallback="No plush matches those filters." /> <Link href="/pages/domina-xl"><PageCopy id="domina.clear_filters" fallback="Clear filters" /></Link></p>}
    </section>
  </div>;
}

export default async function ContentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const { slug } = await params;
  if (slug === "about") return <SiteFrame className="store-page"><AboutPage/></SiteFrame>;
  if (slug === "faq") return <SiteFrame className="store-page"><FaqPage/></SiteFrame>;
  if (slug === "contact") return <SiteFrame className="store-page"><ContactPage/></SiteFrame>;
  if (slug === "partners") return <SiteFrame className="store-page"><PartnerPage /></SiteFrame>;
  if (slug === "domina-xl") return <SiteFrame className="store-page"><DominaPage searchParams={searchParams} /></SiteFrame>;
  if (legalDrafts[slug]) return <LegalDraftPage draft={legalDrafts[slug]} slug={slug} />;
  notFound();
}
