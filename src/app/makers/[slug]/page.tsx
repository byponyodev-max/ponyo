import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SiteFrame } from "@/components/layout/site-frame";
import { LocalizedText } from "@/components/layout/localization-provider";
import { MakerProfileCollection } from "@/components/makers/maker-profile-collection";
import { getLocalizedProducts } from "@/services/localized-products.server";
import { PONYO_API_BASE_URL, ApiRequestError, ApiNotConfiguredError, ponyoApi } from "@/services/ponyo-api.client";
import { JellyfishArtwork } from "@/components/home/jellyfish-artwork";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug.replaceAll("-", " ")} · Maker at Ponyo`, description: "Meet the maker behind a Ponyo collection." };
}

export default async function MakerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const savedLanguage = (await cookies()).get("ponyo-language")?.value;
  const locale = savedLanguage === "ja" || savedLanguage === "ko" ? savedLanguage : "en";
  let profileData;
  if (!PONYO_API_BASE_URL) {
    const products = await getLocalizedProducts("?limit=100", locale);
    const makerProducts = products.filter((product) => product.makerSlug === slug);
    if (!makerProducts.length) notFound();
    const firstProduct = makerProducts[0];
    profileData = {
      maker: {
        name: firstProduct.makerName ?? firstProduct.supplierName,
        location: firstProduct.makerLocation ?? "",
        story: firstProduct.makerStory ?? "",
        philosophy: firstProduct.makerPhilosophy ?? "",
        process: firstProduct.makerProcess ?? "",
        specialties: [...new Set(makerProducts.map((product) => product.productType ?? product.categoryName))],
        profileImageUrl: null,
        website: null,
      },
      products: makerProducts,
    };
  } else {
    try {
      profileData = await ponyoApi.getMakerProfile(slug, locale);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) notFound();
      const isNotConfigured = error instanceof ApiNotConfiguredError;
      const message = error instanceof Error ? error.message : null;
      return <SiteFrame className="store-page maker-profile-page"><section className="maker-profile-unavailable store-container" role="status"><p className="eyebrow"><LocalizedText translationKey="maker.profile.unavailable.eyebrow" fallback="PONYO MAKERS" /></p><h1><LocalizedText translationKey="maker.profile.unavailable.title" fallback="Maker profile unavailable" /></h1><p>{isNotConfigured ? <LocalizedText translationKey="maker.profile.unavailable.not_configured" fallback="Maker profiles will appear here when the Ponyo catalog service is connected." /> : message || <LocalizedText translationKey="maker.profile.unavailable.generic" fallback="The maker profile could not be loaded." />}</p><Link href="/for-makers"><LocalizedText translationKey="maker.profile.unavailable.cta" fallback="For makers" /> <span aria-hidden="true">→</span></Link></section></SiteFrame>;
    }
  }

  const { maker, products } = profileData;
  const makerMaterials = [...new Set(products.map((product) => product.materials?.trim()).filter((material): material is string => Boolean(material)))];
  const makerInitial = maker.name.trim().charAt(0).toUpperCase() || "P";
  return <SiteFrame className="store-page maker-profile-page">
    <section className="maker-profile-hero">
      <div className="maker-profile-visual">
        <div className="maker-profile-portrait">
          <span className="maker-profile-monogram" aria-label={`${maker.name} maker mark`}>{makerInitial}<i aria-hidden="true">✦</i></span>
        </div>
        <span className="maker-profile-jellyfish maker-profile-jellyfish--silver" aria-hidden="true"><JellyfishArtwork id="maker-profile-silver" tone="silver" direction={1} /></span>
        <span className="maker-profile-jellyfish maker-profile-jellyfish--gold" aria-hidden="true"><JellyfishArtwork id="maker-profile-gold" tone="gold" direction={-1} /></span>
        <span className="maker-profile-sparkle maker-profile-sparkle--one" aria-hidden="true">✦</span>
        <span className="maker-profile-sparkle maker-profile-sparkle--two" aria-hidden="true">✧</span>
        <span className="maker-profile-seal" aria-hidden="true"><LocalizedText translationKey="maker.profile.seal" fallback="MADE WITH CARE" /></span>
      </div>
      <div className="maker-profile-copy">
        <p className="eyebrow"><LocalizedText translationKey="maker.profile.eyebrow" fallback="PONYO MAKER PROFILE" /></p>
        <h1>{maker.name}</h1>
        {maker.location && <p className="maker-profile-location"><span aria-hidden="true">✦</span>{maker.location}</p>}
        <p>{maker.story || <LocalizedText translationKey="maker.profile.story_missing" fallback="This maker has not provided a story for publication yet." />}</p>
        <div className="maker-profile-stats">
          <span><strong>{String(products.length).padStart(2, "0")}</strong><small><LocalizedText translationKey={products.length === 1 ? "maker.profile.collection.piece_one" : "maker.profile.collection.piece_other"} fallback={products.length === 1 ? "piece" : "pieces"} /></small></span>
          <span><strong>{String(maker.specialties.length).padStart(2, "0")}</strong><small><LocalizedText translationKey="maker.profile.specialties.label" fallback="Specialties" /></small></span>
        </div>
        <div className="maker-profile-actions">
          <a className="maker-profile-collection-cta" href="#maker-collection-title"><LocalizedText translationKey="maker.profile.collection_cta" fallback="Browse this maker’s collection" /> <span aria-hidden="true">↓</span></a>
          {maker.website && <a className="maker-profile-website" href={maker.website} target="_blank" rel="noreferrer noopener"><LocalizedText translationKey="maker.profile.website_cta" fallback="Maker website" /> <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
    </section>
    <section className="maker-profile-details store-container">
      <article>
        <span className="maker-profile-detail-number" aria-hidden="true">01</span>
        <p className="eyebrow"><LocalizedText translationKey="maker.profile.philosophy.label" fallback="PHILOSOPHY" /></p>
        <h2><LocalizedText translationKey="maker.profile.philosophy.title" fallback="What guides their work" /></h2>
        <p>{maker.philosophy || <LocalizedText translationKey="maker.profile.philosophy.missing" fallback="Maker philosophy has not been provided yet." />}</p>
      </article>
      <article>
        <span className="maker-profile-detail-number" aria-hidden="true">02</span>
        <p className="eyebrow"><LocalizedText translationKey="maker.profile.process.label" fallback="CRAFTSMANSHIP" /></p>
        <h2><LocalizedText translationKey="maker.profile.process.title" fallback="From idea to plush" /></h2>
        <p>{maker.process || <LocalizedText translationKey="maker.profile.process.missing" fallback="Making process details have not been provided yet." />}</p>
      </article>
      <article>
        <span className="maker-profile-detail-number" aria-hidden="true">03</span>
        <p className="eyebrow"><LocalizedText translationKey="maker.profile.materials.label" fallback="MATERIALS" /></p>
        <h2><LocalizedText translationKey="maker.profile.materials.title" fallback="Materials in their collection" /></h2>
        {makerMaterials.length
          ? <ul>{makerMaterials.map((material) => <li key={material}>{material}</li>)}</ul>
          : <p><LocalizedText translationKey="maker.profile.materials.missing" fallback="Material details have not been provided for this maker’s products yet." /></p>}
      </article>
      <article>
        <span className="maker-profile-detail-number" aria-hidden="true">04</span>
        <p className="eyebrow"><LocalizedText translationKey="maker.profile.specialties.label" fallback="SPECIALTIES" /></p>
        <h2><LocalizedText translationKey="maker.profile.specialties.title" fallback="What they make" /></h2>
        {maker.specialties.length
          ? <ul>{maker.specialties.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p><LocalizedText translationKey="maker.profile.specialties.missing" fallback="Product specialties have not been provided yet." /></p>}
      </article>
    </section>
    {products.length
      ? <MakerProfileCollection products={products} />
      : <section className="maker-profile-collection store-container" aria-labelledby="maker-collection-title">
        <header><div><p className="eyebrow"><LocalizedText translationKey="maker.profile.collection.eyebrow" fallback="FOUND ON PONYO" /></p><h2 id="maker-collection-title"><LocalizedText translationKey="maker.profile.collection.title" fallback="Their collection" /></h2></div></header>
        <p className="maker-profile-empty"><LocalizedText translationKey="maker.profile.collection.empty" fallback="This maker has no published products in the Ponyo catalog yet." /></p>
      </section>}
  </SiteFrame>;
}
