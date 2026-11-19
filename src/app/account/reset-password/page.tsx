import { AccountPasswordResetForm } from "@/components/account/account-password-reset-form";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("routes.account.reset_password") };
}

export default function ResetPasswordPage() {
  return <AccountPasswordResetForm />;
}
