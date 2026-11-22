"use client";

import { useState, type FormEvent } from "react";
import { PONYO_API_BASE_URL, ponyoApi } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";
import { useLocalization } from "@/components/layout/localization-provider";
import { PonyoSelect } from "@/components/ui/ponyo-select";

type InquiryDetails = { company: string; email: string; emailNotificationSent: boolean };

export function PartnerInquiryForm() {
  const { t } = useLocalization();
  const [submitted, setSubmitted] = useState<InquiryDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactName, setContactName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [productType, setProductType] = useState("");
  const { customer } = useCustomerSession();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const company = String(values.get("company") ?? "").trim();
    const contactName = String(values.get("contactName") ?? "").trim();
    const email = String(values.get("email") ?? "").trim();
    const website = String(values.get("website") ?? "").trim();
    const productType = String(values.get("productType") ?? "").trim();
    const message = String(values.get("message") ?? "").trim();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      if (!PONYO_API_BASE_URL) {
        setErrorMessage(t("static.partner.api_unavailable", "The partnership form needs the local Ponyo API to save submissions."));
        return;
      }
      const result = await ponyoApi.submitContactRequest({
        name: contactName,
        email,
        requestType: "Supplier partnership",
        message: [
          `Company / maker: ${company}`,
          `Website: ${website || "Not provided"}`,
          `Product category: ${productType}`,
          "Partnership note:",
          message,
        ].join("\n"),
      });
      setSubmitted({ company, email, emailNotificationSent: result.emailNotificationSent });
      setProductType("");
      form.reset();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("static.partner.submit_failed", "Unable to submit your partnership inquiry."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="partner-form-success" role="status">
        <span aria-hidden="true">✿</span>
        <h2>{t("static.partner.thanks", "Thank you, {{company}}.", { company: submitted.company })}</h2>
        <p>{t("static.partner.saved", "Your partnership inquiry has been saved with contact email {{email}}.", { email: submitted.email })} {submitted.emailNotificationSent ? t("static.partner.emailed", "A notification was emailed to Ponyo.") : t("static.partner.email_unavailable", "Ponyo email notifications are not configured yet.")}</p>
      </div>
    );
  }

  return (
    <form className="partner-inquiry-form" onSubmit={handleSubmit}>
      <div className="partner-form-grid">
        <label>{t("static.partner.company", "Company or maker name")} <span>*</span><input name="company" required maxLength={160} autoComplete="organization" placeholder={t("static.partner.company_placeholder", "Your studio or brand")} /></label>
          <label>{t("static.partner.contact", "Contact name")} <span>*</span><input name="contactName" required maxLength={160} autoComplete="name" placeholder={t("static.partner.contact_placeholder", "Your name")} value={contactName ?? [customer?.firstName, customer?.lastName].filter(Boolean).join(" ")} onChange={(event) => setContactName(event.target.value)} /></label>
          <label>{t("static.partner.email", "Business email")} <span>*</span><input name="email" type="email" required maxLength={320} autoComplete="email" placeholder={t("static.account.email_placeholder", "you@example.com")} value={email ?? customer?.email ?? ""} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>{t("static.partner.website", "Website or social link")}<input name="website" type="url" maxLength={500} placeholder="https://" /></label>
      </div>
        <label htmlFor="partner-product-type">{t("static.partner.product_type", "What do you make?")} <span>*</span>
        <PonyoSelect
          id="partner-product-type"
          name="productType"
          label={t("static.partner.product_type", "What do you make?")}
          value={productType}
          onChange={setProductType}
          required
          placeholder={t("static.partner.select_category", "Select a product category")}
          options={[
            { value: "Plush toys", label: t("static.partner.plush", "Plush toys") },
            { value: "Collectible characters", label: t("static.partner.characters", "Collectible characters") },
            { value: "Handmade or limited-edition plush", label: t("static.partner.handmade", "Handmade or limited-edition plush") },
            { value: "Other", label: t("static.partner.other", "Other") },
          ]}
        />
      </label>
        <label>{t("static.partner.message", "Tell us about your products and partnership idea")} <span>*</span><textarea name="message" required minLength={20} maxLength={4000} rows={6} placeholder={t("static.partner.message_placeholder", "Share your product range, where you make it, and how you would like to work with Ponyo.")} /></label>
      {errorMessage && <p className="api-form-error" role="alert">{errorMessage}</p>}
        <button className="shop-button shop-button-orange" type="submit" disabled={isSubmitting}>{isSubmitting ? t("static.partner.sending", "Sending inquiry…") : t("static.partner.submit", "Send partnership inquiry")}<span aria-hidden="true">→</span></button>
        <p className="partner-form-privacy">{t("static.partner.privacy", "Your details will only be used to review this partnership inquiry.")}</p>
    </form>
  );
}
