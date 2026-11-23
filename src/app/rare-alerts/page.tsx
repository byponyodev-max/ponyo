import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NewsletterPanel } from "@/components/layout/newsletter-panel";
import { SiteFrame } from "@/components/layout/site-frame";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("home.forms.drops_title"),
    description: t("home.forms.drops_body"),
  };
}

export default function RareAlertsPage() {
  return (
    <SiteFrame className="store-page rare-alerts-page" showNewsletter={false}>
      <NewsletterPanel rareAlerts />
    </SiteFrame>
  );
}
