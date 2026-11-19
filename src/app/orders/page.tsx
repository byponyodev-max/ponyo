import { SiteFrame } from "@/components/layout/site-frame";
import { LocalOrdersPanel } from "@/components/account/local-orders-panel";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { storefrontFeatures } from "@/lib/storefront-features";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("orders.title") };
}

export default function OrdersPage() {
  if (!storefrontFeatures.customerAccounts) notFound();
  return <SiteFrame className="store-page orders-page" showNewsletter={false}><div className="store-container"><LocalOrdersPanel /></div></SiteFrame>;
}