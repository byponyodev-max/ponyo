"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import { currencyName, regionName, supportedShippingCountries } from "@/lib/localization-options";
import { optimizeJpegPhoto } from "@/lib/optimize-jpeg-photo";
import { ApiRequestError, ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

type ApplicationPhoto = { name: string; file: File; dataUrl: string };

export function MakerApplicationForm() {
  const { t } = useLocalization();
  const photoInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<ApplicationPhoto[]>([]);
  const [photoMessage, setPhotoMessage] = useState("");
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [countrySelection, setCountrySelection] = useState("");
  const [countryError, setCountryError] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("JPY");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function preparePhotos(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const remainingSlots = Math.max(0, 3 - photos.length);
    const candidates = selected.slice(0, remainingSlots);
    const allowed = candidates.filter((file) =>
      file.size <= 5 * 1024 * 1024
      && ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    );
    setPreparingPhotos(true);
    try {
      const results = await Promise.allSettled(allowed.map(async (file) => {
        const dataUrl = await optimizeJpegPhoto(file);
        return dataUrl.length <= 550_000 ? { name: file.name, file, dataUrl } : null;
      }));
      const prepared = results.flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value] : [],
      );
      const skipped = selected.length - prepared.length;
      setPhotos((current) => [...current, ...prepared].slice(0, 3));
      setPhotoMessage(skipped ? t("maker.application.photos.skipped", "{{count}} photo(s) could not be added. Choose JPEG, PNG, or WebP files under 5 MB each, up to three in total.", { count: skipped }) : "");
    } finally {
      setPreparingPhotos(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    const requiredTextFields = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input[required]:not([type="file"]), textarea[required]',
    );
    for (const field of requiredTextFields) {
      const trimmed = field.value.trim();
      const minimumLength = field.minLength;
      field.setCustomValidity(
        !trimmed
          ? t("maker.application.validation.required", "Please complete this field.")
          : minimumLength > 0 && trimmed.length < minimumLength
            ? t("maker.application.validation.min_length", "Please enter at least {{count}} characters.", { count: minimumLength })
            : "",
      );
    }
    const minimumPrice = form.querySelector<HTMLInputElement>('[name="priceMinimum"]');
    const maximumPrice = form.querySelector<HTMLInputElement>('[name="priceMaximum"]');
    if (minimumPrice && maximumPrice) {
      maximumPrice.setCustomValidity(
        !minimumPrice.value || !maximumPrice.value || Number(minimumPrice.value) <= Number(maximumPrice.value)
          ? ""
          : t("maker.application.validation.price_order", "Maximum price must be greater than or equal to minimum price."),
      );
    }
    if (!form.reportValidity()) return;
    if (!countrySelection) {
      setCountryError(t("maker.application.validation.country", "Choose a country or region."));
      form.querySelector<HTMLButtonElement>(".maker-country-trigger")?.focus();
      return;
    }
    setCountryError("");
    if (!PONYO_API_BASE_URL) {
      setError(t("maker.application.error.unconfigured", "Maker applications cannot be saved because the Ponyo application service is not configured."));
      return;
    }
    if (photos.length === 0) {
      setError(t("maker.application.error.photo_required", "Please add at least one product photo."));
      return;
    }
    const values = new FormData(form);
    const country = countrySelection === "OTHER"
      ? String(values.get("otherCountry") ?? "").trim()
      : supportedShippingCountries.find((option) => option.code === countrySelection)?.label ?? "";
    const minimum = Number(values.get("priceMinimum"));
    const maximum = Number(values.get("priceMaximum"));
    const submission = new FormData();
    const fields = {
      makerName: String(values.get("makerName") ?? "").trim(),
      contactPerson: String(values.get("contactPerson") ?? "").trim(),
      email: String(values.get("email") ?? "").trim(),
      country,
      city: String(values.get("city") ?? "").trim(),
      website: optionalUrl(values.get("website")),
      socialMedia: optionalUrl(values.get("socialMedia")),
      productUrl: String(values.get("productUrl") ?? "").trim(),
      productDescription: String(values.get("productDescription") ?? "").trim(),
      provenDesireEvidence: String(values.get("provenDesireEvidence") ?? "").trim(),
      materials: String(values.get("materials") ?? "").trim(),
      priceRange: `${priceCurrency} ${minimum.toLocaleString("en-US")}–${maximum.toLocaleString("en-US")}`,
      ponyoExclusivity: String(values.get("ponyoExclusivity") ?? "").trim(),
    };
    for (const [name, value] of Object.entries(fields)) {
      if (value !== null) submission.set(name, value);
    }
    for (const photo of photos) {
      submission.append("productPhotos", photo.file, photo.file.name);
    }
    setSaving(true);
    try {
      await ponyoApi.submitMakerApplication(submission);
      setSubmitted(true);
      setPhotos([]);
      setPriceCurrency("JPY");
      form.reset();
    } catch (submitError) {
      setError(
        submitError instanceof ApiRequestError && submitError.status === 503
          ? t("maker.application.error.storage_unavailable", "Photo uploads are temporarily unavailable because maker photo storage is not set up yet. Please try again later or contact Ponyo.")
          : submitError instanceof Error
            ? submitError.message
            : t("maker.application.error.submit", "Your maker application could not be saved."),
      );
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

  return <form className="maker-application-form" onSubmit={submitApplication} onInput={(event) => {
    const field = event.target;
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.setCustomValidity("");
    }
  }}>
    <div className="maker-form-intro">
      <p className="eyebrow">{t("maker.application.form.eyebrow", "A THOUGHTFUL FIRST HELLO")}</p>
      <h2>{t("maker.application.form.title", "Tell us what you make")}</h2>
      <p>{t("maker.application.form.intro", "Share real product details and images so our team can review your work. Required fields are marked.")}</p>
    </div>
    {!PONYO_API_BASE_URL && <p className="maker-form-service-note" role="alert">{t("maker.application.service_unavailable", "The application service is not available right now, so submissions are temporarily unavailable.")}</p>}
    <div className="maker-form-grid">
      <label><span className="maker-field-label">{t("maker.application.field.maker", "Maker or brand name")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input name="makerName" required maxLength={180} autoComplete="organization" /></label>
      <label><span className="maker-field-label">{t("maker.application.field.contact", "Contact person")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input name="contactPerson" required maxLength={160} autoComplete="name" /></label>
      <label><span className="maker-field-label">{t("maker.application.field.email", "Email")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input name="email" type="email" required maxLength={320} autoComplete="email" /></label>
      <label>
        <span className="maker-field-label" id="maker-country-label">{t("maker.application.field.country", "Country")} <span className="maker-required-marker" aria-hidden="true">*</span></span>
        <MakerCountryPicker
          value={countrySelection}
          error={countryError}
          onChange={(value) => {
            setCountrySelection(value);
            setCountryError("");
          }}
        />
      </label>
      {countrySelection === "OTHER" && <label><span className="maker-field-label">{t("maker.application.country.other_name", "Country or region")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input name="otherCountry" required maxLength={100} autoComplete="country-name" /></label>}
      <label><span className="maker-field-label">{t("maker.application.field.city", "City")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input name="city" required maxLength={120} autoComplete="address-level2" /></label>
      <label><span className="maker-field-label">{t("maker.application.field.website", "Website")}</span><input name="website" type="url" maxLength={500} placeholder="https://" /></label>
      <label><span className="maker-field-label">{t("maker.application.field.social", "Social media")}</span><input name="socialMedia" type="url" maxLength={500} placeholder="https://" /></label>
      <label><span className="maker-field-label">{t("maker.application.field.product_link", "Product link")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input name="productUrl" type="url" required maxLength={500} placeholder="https://" /></label>
    </div>
    <div className="maker-price-range">
      <div className="maker-currency-field">
        <span className="maker-field-label" id="maker-price-currency-label">{t("maker.application.field.price_currency", "Currency")} <span className="maker-required-marker" aria-hidden="true">*</span></span>
        <MakerCurrencyPicker value={priceCurrency} onChange={setPriceCurrency} />
        <input type="hidden" name="priceCurrency" value={priceCurrency} />
      </div>
      <label><span className="maker-field-label">{t("maker.application.field.price_minimum", "Minimum price")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input type="number" name="priceMinimum" required min={1} max={999999999999999} step={1} inputMode="numeric" /></label>
      <label><span className="maker-field-label">{t("maker.application.field.price_maximum", "Maximum price")} <span className="maker-required-marker" aria-hidden="true">*</span></span><input type="number" name="priceMaximum" required min={1} max={999999999999999} step={1} inputMode="numeric" /></label>
    </div>
    <label><span className="maker-field-label">{t("maker.application.field.product_description", "Product description")} <span className="maker-required-marker" aria-hidden="true">*</span></span><textarea name="productDescription" required minLength={20} maxLength={4000} rows={5} placeholder={t("maker.application.placeholder.product_description", "Describe the product, how it is made, and what makes it distinctive.")} /></label>
    <label><span className="maker-field-label">{t("maker.application.field.demand", "Evidence of customer demand")} <span className="maker-required-marker" aria-hidden="true">*</span></span><textarea name="provenDesireEvidence" required minLength={10} maxLength={2000} rows={3} placeholder={t("maker.application.placeholder.demand", "Share links or details such as a past sell-out, waitlist, or resale history.")} /></label>
    <label><span className="maker-field-label">{t("maker.application.field.materials", "Materials")} <span className="maker-required-marker" aria-hidden="true">*</span></span><textarea name="materials" required minLength={2} maxLength={2000} rows={3} placeholder={t("maker.application.placeholder.materials", "List the fabrics, filling, and other materials you can verify.")} /></label>
    <label><span className="maker-field-label">{t("maker.application.field.exclusivity", "Could this creation be exclusive to Ponyo?")} <span className="maker-required-marker" aria-hidden="true">*</span></span><textarea name="ponyoExclusivity" required minLength={10} maxLength={2000} rows={3} placeholder={t("maker.application.placeholder.exclusivity", "Describe any existing sales channels, exclusivity terms, or what you could offer Ponyo.")} /></label>
    <div className="maker-photo-field">
      <div className="maker-photo-heading"><p className="maker-field-label">{t("maker.application.field.photos", "Product photos")} <span className="maker-required-marker" aria-hidden="true">*</span></p><span className="maker-photo-count">{photos.length}/3</span></div>
      <p>{t("maker.application.photos.help", "Upload 1–3 images. JPEG, PNG, or WebP; up to 5 MB each. Photos are optimized and stored with your application for review.")}</p>
      <input className="maker-photo-input" id="maker-application-photos" ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={preparingPhotos || photos.length >= 3} aria-hidden="true" tabIndex={-1} onChange={(event) => void preparePhotos(event.currentTarget.files)} />
      <button className="maker-photo-choose" type="button" disabled={preparingPhotos || photos.length >= 3} onClick={() => photoInput.current?.click()}>{preparingPhotos ? t("maker.application.photos.preparing", "Preparing photos…") : t("maker.application.photos.choose", "Choose product photos")} <span aria-hidden="true">↑</span></button>
      {photoMessage && <p className="maker-form-hint" role="status">{photoMessage}</p>}
      {photos.length > 0 && <div className="maker-photo-preview">{photos.map((photo, index) => <span key={`${photo.name}-${photo.file.lastModified}-${index}`}><Image src={photo.dataUrl} alt={`${t("maker.application.photos.alt", "Product example")}: ${photo.name}`} width={100} height={100} unoptimized /><button type="button" disabled={preparingPhotos} aria-label={`${t("maker.application.photos.remove", "Remove")} ${photo.name}`} onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>×</button></span>)}</div>}
    </div>
    {error && <div className="maker-form-error" role="alert"><span aria-hidden="true">!</span><div><strong>{t("maker.application.error.title", "Application not sent")}</strong><p>{error}</p></div></div>}
    <button className="shop-button shop-button-orange" type="submit" disabled={saving || !PONYO_API_BASE_URL}>{saving ? t("maker.application.button.sending", "Sending your application…") : t("maker.application.button.submit", "Submit maker application")}<span aria-hidden="true">→</span></button>
    <small className="maker-form-privacy">{t("maker.application.privacy", "Your contact details, product information, and photos are used to evaluate this application. See the")} <Link href="/pages/privacy-policy">{t("home.footer.privacy", "Privacy Policy")} {t("maker.application.privacy_draft", "draft")}</Link>.</small>
  </form>;
}

function MakerCountryPicker({
  value,
  error,
  onChange,
}: {
  value: string;
  error: string;
  onChange: (value: string) => void;
}) {
  const { language, t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const options = useMemo(() => [
    ...supportedShippingCountries.map((country) => ({
      code: country.code,
      label: regionName(country.code, language, country.label),
    })),
    { code: "OTHER", label: t("maker.application.country.other", "Other country or region") },
  ], [language, t]);
  const search = query.trim().toLocaleLowerCase();
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.code}`.toLocaleLowerCase().includes(search),
  );
  const selectedCountry = options.find((option) => option.code === value);
  const searchId = "maker-country-search";
  const optionsId = "maker-country-options";

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        wrapper.current?.querySelector<HTMLButtonElement>(".maker-country-trigger")?.focus();
      }
      if (event.key === "ArrowDown" && event.target === searchInput.current) {
        event.preventDefault();
        wrapper.current?.querySelector<HTMLButtonElement>(".maker-country-option")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function chooseCountry(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  function navigateOptions(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const optionButtons = wrapper.current?.querySelectorAll<HTMLButtonElement>(".maker-country-option");
    if (!optionButtons?.length) return;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? optionButtons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : optionButtons.length - 1)) % optionButtons.length;
    optionButtons[nextIndex]?.focus();
  }

  return (
    <div className="maker-country-picker" ref={wrapper}>
      <button
        className="maker-country-trigger"
        type="button"
        aria-labelledby="maker-country-label"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={optionsId}
        aria-describedby={error ? "maker-country-error" : undefined}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span className={`maker-country-badge${value === "OTHER" ? " is-other" : ""}`} aria-hidden="true">
          {selectedCountry?.code === "OTHER" ? "✧" : selectedCountry?.code ?? "✦"}
        </span>
        <span className={`maker-country-value${selectedCountry ? "" : " is-placeholder"}`}>
          {selectedCountry?.label ?? t("maker.application.country.choose", "Choose a country")}
        </span>
        <svg className="maker-country-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <section className="maker-country-popover" role="dialog" aria-label={t("maker.application.country.choose", "Choose a country")}>
        <header className="maker-country-heading">
          <span className="maker-country-sparkle" aria-hidden="true">✦</span>
          <strong>{t("maker.application.country.choose", "Choose a country")}</strong>
          <button type="button" aria-label={t("general.close", "Close")} onClick={() => setOpen(false)}>×</button>
        </header>
        <label className="maker-country-search" htmlFor={searchId}>
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchInput}
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t("delivery.search_country", "Search countries")}
          />
        </label>
        <div className="maker-country-options" id={optionsId} role="listbox" aria-label={t("maker.application.field.country", "Country")}>
          {filteredOptions.map((option, index) => <button
            type="button"
            role="option"
            aria-selected={value === option.code}
            className="maker-country-option"
            key={option.code}
            onKeyDown={(event) => navigateOptions(event, index)}
            onClick={() => chooseCountry(option.code)}
          >
            <span className={`maker-country-badge${option.code === "OTHER" ? " is-other" : ""}`} aria-hidden="true">
              {option.code === "OTHER" ? "✧" : option.code}
            </span>
            <b>{option.label}</b>
            <small>{option.code === "OTHER" ? t("maker.application.country.other_short", "Other") : option.code}</small>
            {value === option.code && <span className="maker-country-check" aria-hidden="true">✓</span>}
          </button>)}
          {filteredOptions.length === 0 && <p className="maker-country-empty">{t("delivery.no_countries", "No countries found. Try another search.")}</p>}
        </div>
      </section>}
      {error && <span className="maker-country-error" id="maker-country-error" role="alert">{error}</span>}
    </div>
  );
}

function MakerCurrencyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { currencies, language, t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const options = useMemo(() => currencies.map((currency) => {
    const country = supportedShippingCountries.find((item) => item.label === currency.country);
    return {
      ...currency,
      name: currencyName(currency.code, language, currency.label),
      countryName: country ? regionName(country.code, language, currency.country) : currency.country,
    };
  }), [currencies, language]);
  const search = query.trim().toLocaleLowerCase();
  const filteredOptions = options.filter((option) =>
    `${option.name} ${option.label} ${option.countryName} ${option.code} ${option.symbol}`.toLocaleLowerCase().includes(search),
  );
  const selectedCurrency = options.find((option) => option.code === value);
  const searchId = "maker-currency-search";
  const optionsId = "maker-currency-options";
  const labelId = "maker-price-currency-label";

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        wrapper.current?.querySelector<HTMLButtonElement>(".maker-currency-trigger")?.focus();
      }
      if (event.key === "ArrowDown" && event.target === searchInput.current) {
        event.preventDefault();
        wrapper.current?.querySelector<HTMLButtonElement>(".maker-currency-option")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function chooseCurrency(code: string) {
    onChange(code);
    setOpen(false);
    setQuery("");
  }

  function navigateOptions(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const optionButtons = wrapper.current?.querySelectorAll<HTMLButtonElement>(".maker-currency-option");
    if (!optionButtons?.length) return;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? optionButtons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : optionButtons.length - 1)) % optionButtons.length;
    optionButtons[nextIndex]?.focus();
  }

  return (
    <div className="maker-currency-picker" ref={wrapper}>
      <button
        className="maker-currency-trigger"
        type="button"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={optionsId}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span className="maker-currency-badge" aria-hidden="true">{selectedCurrency?.symbol ?? "¤"}</span>
        <span className={`maker-currency-value${selectedCurrency ? "" : " is-placeholder"}`}>
          <b>{selectedCurrency?.name ?? t("maker.application.currency.choose", "Choose a currency")}</b>
          {selectedCurrency && <small>{selectedCurrency.countryName} · {selectedCurrency.code}</small>}
        </span>
        <svg className="maker-country-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <section className="maker-currency-popover" role="dialog" aria-labelledby={labelId}>
        <header className="maker-currency-heading">
          <span className="maker-country-sparkle" aria-hidden="true">✦</span>
          <strong>{t("maker.application.field.price_currency", "Currency")}</strong>
          <button type="button" aria-label={t("general.close", "Close")} onClick={() => setOpen(false)}>×</button>
        </header>
        <label className="maker-currency-search" htmlFor={searchId}>
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchInput}
            id={searchId}
            type="search"
            aria-label={t("localization.search_currency", "Search currencies or countries")}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t("localization.search_currency", "Search currencies or countries")}
          />
        </label>
        <div className="maker-currency-options" id={optionsId} role="listbox" aria-label={t("maker.application.field.price_currency", "Currency")}>
          {filteredOptions.map((option, index) => <button
            type="button"
            role="option"
            aria-selected={value === option.code}
            className="maker-currency-option"
            key={option.code}
            onKeyDown={(event) => navigateOptions(event, index)}
            onClick={() => chooseCurrency(option.code)}
          >
            <span className="maker-currency-badge" aria-hidden="true">{option.symbol}</span>
            <b>{option.name}</b>
            <small>{option.countryName} · {option.code}</small>
            {value === option.code && <span className="maker-country-check" aria-hidden="true">✓</span>}
          </button>)}
          {filteredOptions.length === 0 && <p className="maker-country-empty">{t("localization.no_matches", "No matches yet. Try another search.")}</p>}
        </div>
      </section>}
    </div>
  );
}

function optionalUrl(value: FormDataEntryValue | null) {
  const url = String(value ?? "").trim();
  return url || null;
}
