"use client";

"use client";

import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";
import styles from "./account/verify-email/verification.module.css";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  const { t } = useLocalization();
  return (
    <main className={styles.page}>
      <section className={styles.card} role="alert" aria-labelledby="page-error-title">
        <Link href="/" className="account-auth-brand">PONYO</Link>
        <div className={styles.heading}>
          <span className="account-auth-eyebrow">{t("static.error.eyebrow", "A LITTLE HICCUP")}</span>
          <h1 id="page-error-title">{t("static.error.title", "Let’s try that again.")}</h1>
          <p>{t("static.error.body", "We couldn’t load this page. Please try again in a moment. If you were placing an order, check your order history before submitting it again.")}</p>
        </div>
        <button className={styles.primary} onClick={() => retry()}>{t("static.error.retry", "Try again")}</button>
        <Link className={styles.back} href="/">{t("static.error.back", "← Back to Ponyo")}</Link>
      </section>
    </main>
  );
}