import { AccountAuthForm } from "@/components/account/account-auth-form";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("routes.account.login") };
}

export default function AccountLoginPage() {
  return <AccountAuthForm mode="login" />;
}
