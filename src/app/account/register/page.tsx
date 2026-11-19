import { AccountAuthForm } from "@/components/account/account-auth-form";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("routes.account.register") };
}

export default function AccountRegisterPage() {
  return <AccountAuthForm mode="register" />;
}
