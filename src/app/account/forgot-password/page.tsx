import { AccountAuthForm } from "@/components/account/account-auth-form";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("routes.account.forgot_password") };
}

export default function ForgotPasswordPage() {
  return <AccountAuthForm mode="forgot" />;
}
