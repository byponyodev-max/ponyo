import { AccountDashboard } from "@/components/account/account-dashboard";
import { SiteFrame } from "@/components/layout/site-frame";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("routes.account.profile") };
}

export default function AccountPage() {
  return <SiteFrame className="store-page account-store-page" showNewsletter={false}><div className="store-container"><AccountDashboard /></div></SiteFrame>;
}