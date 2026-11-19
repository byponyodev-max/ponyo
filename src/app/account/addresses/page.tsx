import { AccountAddressBook } from "@/components/account/account-address-book";
import { SiteFrame } from "@/components/layout/site-frame";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("routes.account.addresses") };
}

export default function AccountAddressesPage() {
  return <SiteFrame className="store-page account-store-page" showNewsletter={false}><div className="store-container"><AccountAddressBook /></div></SiteFrame>;
}
