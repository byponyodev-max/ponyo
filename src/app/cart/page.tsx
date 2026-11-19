import { SiteFrame } from "@/components/layout/site-frame";
import { CartPageClient } from "@/components/layout/cart-page-client";
import { storefrontFeatures } from "@/lib/storefront-features";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("routes.cart.title") };
}

export default function CartPage() {
  if (!storefrontFeatures.commerce) notFound();
  return <SiteFrame className="store-page cart-page" showNewsletter={false}><CartPageClient /></SiteFrame>;
}
