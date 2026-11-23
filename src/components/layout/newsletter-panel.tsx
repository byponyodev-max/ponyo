"use client";

import Image from "next/image";
import { useState } from "react";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";
import { useLocalization } from "@/components/layout/localization-provider";
import { JellyfishArtwork } from "@/components/home/jellyfish-artwork";

export function NewsletterPanel({ rareAlerts = false }: { rareAlerts?: boolean }) {
  const [subscribed, setSubscribed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [emailEdited, setEmailEdited] = useState(false);
  const { customer } = useCustomerSession();
  const { t } = useLocalization();
  const titleId = rareAlerts ? "rare-alerts-title" : "store-newsletter-title";
  const Heading = rareAlerts ? "h1" : "h2";

  async function subscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      if (!PONYO_API_BASE_URL) {
        setErrorMessage(t("home.newsletter.unavailable", "Newsletter signup is unavailable right now. Please try again later."));
        return;
      }
      await ponyoApi.subscribeNewsletter(String(formData.get("email") ?? ""));
      setSubscribed(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to subscribe right now.");
    } finally { setIsSubmitting(false); }
  }

  return (
    <section className={`store-newsletter store-container${rareAlerts ? " store-newsletter--rare-alerts" : ""}`} id={rareAlerts ? undefined : "drops"} aria-labelledby={titleId}>
      <div className="newsletter-jellyfish-divider" aria-hidden="true">
        {[22, 16, 20, 15, 22].map((size, index) => <svg key={`${size}-${index}`} width={size} height={size} viewBox="0 0 64 64" style={{ animationDelay: `${index * -0.55}s` }}><path d="M12 28C12 15 20 6 32 6C44 6 52 15 52 28C52 33 48 36 44 36H20C16 36 12 33 12 28Z" fill="currentColor"/><circle cx="26" cy="23" r="2.4" fill="#4a3530"/><circle cx="38" cy="23" r="2.4" fill="#4a3530"/><path d="M19 38c0 4-2 6-2 10M27 38c0 5 2 7 0 12M35 38c0 5-1 7 1 12M43 38c0 4 2 6 1 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>)}
      </div>
      {rareAlerts && <div className="rare-alerts-jellyfish" aria-hidden="true"><JellyfishArtwork id="rare-alerts-feature" tone="gold" direction={1} /></div>}
      <div className="newsletter-mascot">
        <Image src="/images/catalog/maker-penguin.jpg" alt="" width={90} height={90} />
        <strong>{rareAlerts ? t("home.footer.drops", "Rare drop alerts") : t("home.newsletter.kicker", "Stay in the loop!")}</strong>
        <small>{rareAlerts ? t("home.forms.drops_body", "Rare and limited plush drops, first to your inbox.") : t("home.newsletter.kicker_sub", "New plush finds & notes")}</small>
      </div>
      <div className="store-newsletter-copy">
        <Heading id={titleId}>{rareAlerts ? t("home.forms.drops_title", "Rare drop alerts") : t("home.newsletter.title", "Get first dibs on new plush drops.")}</Heading>
        {rareAlerts && <p className="rare-alerts-signup-description">{t("home.forms.drops_body", "Rare and limited plush drops, first to your inbox.")}</p>}
        {subscribed ? <p className="newsletter-success" role="status">{rareAlerts ? t("home.forms.drops_success", "You’re on the list. We’ll let you know when rare plush arrives.") : t("home.newsletter.success", "Thanks for subscribing! Watch your inbox for new plush drops.")}</p> : (
          <form onSubmit={subscribe}>
            <label className="sr-only" htmlFor="store-newsletter-email">{t(rareAlerts ? "home.forms.email_label" : "home.newsletter.placeholder", "Your email address")}</label>
            <input id="store-newsletter-email" name="email" type="email" required autoComplete="email" placeholder={t(rareAlerts ? "home.forms.email_placeholder" : "home.newsletter.placeholder", "Your email address")} value={emailEdited ? email ?? "" : email ?? customer?.email ?? ""} onChange={(event) => { setEmailEdited(true); setEmail(event.target.value); }} />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? t("home.forms.wait", "Please wait…") : t(rareAlerts ? "home.forms.drops_cta" : "home.newsletter.submit", "Subscribe")}</button>
          </form>
        )}
        {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
      </div>
      <div className="store-newsletter-brand"><strong>PONYO</strong><span>{t("home.newsletter.tagline", "Softness for a kinder world ♡")}</span></div>
    </section>
  );
}
