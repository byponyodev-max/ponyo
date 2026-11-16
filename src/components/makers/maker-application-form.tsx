"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import { optimizeJpegPhoto } from "@/lib/optimize-jpeg-photo";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

type ApplicationPhoto = { name: string; dataUrl: string };

export function MakerApplicationForm() {
  const { t } = useLocalization();
  const photoInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<ApplicationPhoto[]>([]);
  const [photoMessage, setPhotoMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function preparePhotos(files: FileList | null) {
    const selected = Array.from(files ?? []);
    const allowed = selected.filter((file) =>
      file.size <= 5 * 1024 * 1024
      && ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    ).slice(0, 3);
    const results = await Promise.allSettled(allowed.map(async (file) => {
      const dataUrl = await optimizeJpegPhoto(file);
      return dataUrl.length <= 550_000 ? { name: file.name, dataUrl } : null;
    }));
    const prepared = results.flatMap((result) =>
      result.status === "fulfilled" && result.value ? [result.value] : [],
    );
    const skipped = selected.length - prepared.length;
    setPhotos(prepared);
    setPhotoMessage(skipped ? t("maker.application.photos.skipped", "{{count}} photo(s) were skipped. Choose up to three image files under 5 MB each.", { count: skipped }) : "");
    if (photoInput.current) photoInput.current.value = "";
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!PONYO_API_BASE_URL) {
      setError(t("maker.application.error.unconfigured", "Maker applications cannot be saved because the Ponyo application service is not configured."));
      return;
    }
    if (photos.length === 0) {
      setError(t("maker.application.error.photo_required", "Please add at least one product photo."));
      return;
    }
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    try {
      await ponyoApi.submitMakerApplication({
        makerName: String(values.get("makerName") ?? "").trim(),
        contactPerson: String(values.get("contactPerson") ?? "").trim(),
        email: String(values.get("email") ?? "").trim(),
        country: String(values.get("country") ?? "").trim(),
        city: String(values.get("city") ?? "").trim(),
        website: optionalUrl(values.get("website")),
        socialMedia: optionalUrl(values.get("socialMedia")),
        productUrl: String(values.get("productUrl") ?? "").trim(),
        productDescription: String(values.get("productDescription") ?? "").trim(),
        provenDesireEvidence: String(values.get("provenDesireEvidence") ?? "").trim(),
        materials: String(values.get("materials") ?? "").trim(),
        priceRange: String(values.get("priceRange") ?? "").trim(),
        productPhotos: photos.map((photo) => photo.dataUrl),
        ponyoExclusivity: String(values.get("ponyoExclusivity") ?? "").trim(),
      });
      setSubmitted(true);
      setPhotos([]);
      form.reset();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("maker.application.error.submit", "Your maker application could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  if (submitted) {
    return <div className="maker-application-success" role="status">
      <span aria-hidden="true">✦</span><p className="eyebrow">{t("maker.application.success.eyebrow", "APPLICATION RECEIVED")}</p>
      <h2>{t("maker.application.success.title", "Thank you for sharing your work.")}</h2>
      <p>{t("maker.application.success.body", "Your application is saved for Ponyo’s team to review. Sending an application does not guarantee selection or create a partnership.")}</p>
    </div>;
  }

  return <form className="maker-application-form" onSubmit={submitApplication}>
    <div className="maker-form-intro"><p className="eyebrow">{t("maker.application.form.eyebrow", "A THOUGHTFUL FIRST HELLO")}</p><h2>{t("maker.application.form.title", "Tell us what you make")}</h2><p>{t("maker.application.form.intro", "Share real product details and images so our team can review your work. Required fields are marked.")}</p></div>
    {!PONYO_API_BASE_URL && <p className="maker-form-service-note" role="status">{t("maker.application.service_unavailable", "The application service is not configured right now, so submissions are temporarily unavailable.")}</p>}
    <div className="maker-form-grid">
      <label>{t("maker.application.field.maker", "Maker or brand name")} <span>*</span><input name="makerName" required maxLength={180} autoComplete="organization" /></label>
      <label>{t("maker.application.field.contact", "Contact person")} <span>*</span><input name="contactPerson" required maxLength={160} autoComplete="name" /></label>
      <label>{t("maker.application.field.email", "Email")} <span>*</span><input name="email" type="email" required maxLength={320} autoComplete="email" /></label>
      <label>{t("maker.application.field.country", "Country")} <span>*</span><input name="country" required maxLength={100} autoComplete="country-name" /></label>
      <label>{t("maker.application.field.city", "City")} <span>*</span><input name="city" required maxLength={120} autoComplete="address-level2" /></label>
      <label>{t("maker.application.field.website", "Website")}<input name="website" type="url" maxLength={500} placeholder="https://" /></label>
      <label>{t("maker.application.field.social", "Social media")}<input name="socialMedia" type="url" maxLength={500} placeholder="https://" /></label>
      <label>{t("maker.application.field.product_link", "Product link")} <span>*</span><input name="productUrl" type="url" required maxLength={500} placeholder="https://" /></label>
      <label>{t("maker.application.field.price_range", "Price range")} <span>*</span><input name="priceRange" required maxLength={160} placeholder={t("maker.application.placeholder.price_range", "Include currency and typical range")} /></label>
    </div>
    <label>{t("maker.application.field.product_description", "Product description")} <span>*</span><textarea name="productDescription" required minLength={20} maxLength={4000} rows={5} placeholder={t("maker.application.placeholder.product_description", "Describe the product, how it is made, and what makes it distinctive.")} /></label>
    <label>{t("maker.application.field.demand", "Evidence of customer demand")} <span>*</span><textarea name="provenDesireEvidence" required minLength={10} maxLength={2000} rows={3} placeholder={t("maker.application.placeholder.demand", "Share links or details such as a past sell-out, waitlist, or resale history.")} /></label>
    <label>{t("maker.application.field.materials", "Materials")} <span>*</span><textarea name="materials" required minLength={2} maxLength={2000} rows={3} placeholder={t("maker.application.placeholder.materials", "List the fabrics, filling, and other materials you can verify.")} /></label>
    <label>{t("maker.application.field.exclusivity", "Could this creation be exclusive to Ponyo?")} <span>*</span><textarea name="ponyoExclusivity" required minLength={10} maxLength={2000} rows={3} placeholder={t("maker.application.placeholder.exclusivity", "Describe any existing sales channels, exclusivity terms, or what you could offer Ponyo.")} /></label>
    <div className="maker-photo-field">
      <label htmlFor="maker-application-photos">{t("maker.application.field.photos", "Product photos")} <span>*</span></label>
      <p>{t("maker.application.photos.help", "Upload 1–3 images. JPEG, PNG, or WebP; up to 5 MB each. Photos are optimized and stored with your application for review.")}</p>
      <input id="maker-application-photos" ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => void preparePhotos(event.currentTarget.files)} />
      {photoMessage && <p className="maker-form-hint" role="status">{photoMessage}</p>}
      {photos.length > 0 && <div className="maker-photo-preview">{photos.map((photo, index) => <span key={`${photo.name}-${index}`}><Image src={photo.dataUrl} alt={`${t("maker.application.photos.alt", "Product example")}: ${photo.name}`} width={100} height={100} unoptimized /><button type="button" aria-label={`${t("maker.application.photos.remove", "Remove")} ${photo.name}`} onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>×</button></span>)}</div>}
    </div>
    {error && <p className="api-form-error" role="alert">{error}</p>}
    <button className="shop-button shop-button-orange" type="submit" disabled={saving || !PONYO_API_BASE_URL}>{saving ? t("maker.application.button.sending", "Sending your application…") : t("maker.application.button.submit", "Submit maker application")}<span aria-hidden="true">→</span></button>
    <small className="maker-form-privacy">{t("maker.application.privacy", "Your contact details, product information, and photos are used to evaluate this application. See the")} <Link href="/pages/privacy-policy">{t("home.footer.privacy", "Privacy Policy")} {t("maker.application.privacy_draft", "draft")}</Link>.</small>
  </form>;
}

function optionalUrl(value: FormDataEntryValue | null) {
  const url = String(value ?? "").trim();
  return url || null;
}
