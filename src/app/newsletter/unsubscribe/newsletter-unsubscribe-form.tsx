"use client";

import { useState, type FormEvent } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import { ApiNotConfiguredError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import styles from "./newsletter-unsubscribe.module.css";

export function NewsletterUnsubscribeForm({ token }: { token: string }) {
	const { t } = useLocalization();
	const [saving, setSaving] = useState(false);
	const [unsubscribed, setUnsubscribed] = useState(false);
	const [error, setError] = useState("");

	async function unsubscribe(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setError("");
		try {
			if (!PONYO_API_BASE_URL) throw new ApiNotConfiguredError();
			await ponyoApi.unsubscribeNewsletter(token);
			setUnsubscribed(true);
		} catch (requestError) {
			setError(requestError instanceof Error
				? requestError.message
				: t("home.newsletter.unsubscribe_error", "We couldn't update your subscription. Please try again."));
		} finally {
			setSaving(false);
		}
	}

	const valid = Boolean(token && PONYO_API_BASE_URL);
	return <section className={styles.card} aria-labelledby="newsletter-unsubscribe-title">
		<span className={styles.mark} aria-hidden="true">✉</span>
		<p className={styles.eyebrow}>PONYO NEWSLETTER</p>
		<h1 id="newsletter-unsubscribe-title">
			{unsubscribed
				? t("home.newsletter.unsubscribe_success_title", "You’re unsubscribed")
				: t("home.newsletter.unsubscribe_title", "Manage newsletter subscription")}
		</h1>
		<p className={styles.copy}>
			{unsubscribed
				? t("home.newsletter.unsubscribe_success", "You won’t receive future Ponyo newsletter emails at this address.")
				: t("home.newsletter.unsubscribe_body", "Confirm below to stop receiving Ponyo newsletter emails. This does not affect product availability alerts or order emails.")}
		</p>
		{error && <p className={styles.error} role="alert">{error}</p>}
		{!unsubscribed && (valid
			? <form onSubmit={(event) => void unsubscribe(event)}><button type="submit" disabled={saving}>{saving ? t("home.newsletter.unsubscribe_saving", "Updating…") : t("home.newsletter.unsubscribe_button", "Unsubscribe")}<span aria-hidden="true">→</span></button></form>
			: <p className={styles.error} role="alert">{t("home.newsletter.unsubscribe_invalid", "This unsubscribe link is invalid or unavailable.")}</p>)}
	</section>;
}
