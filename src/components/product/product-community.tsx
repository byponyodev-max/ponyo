"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef } from "react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocalization } from "@/components/layout/localization-provider";
import { regionName } from "@/lib/localization-options";
import { ponyoApi, PONYO_API_BASE_URL, type CustomerProfile, type ProductReview, type ProductReviewSummary } from "@/services/ponyo-api.client";
import { optimizeJpegPhoto } from "@/lib/optimize-jpeg-photo";

const emptySummary: ProductReviewSummary = { averageRating: 0, reviewCount: 0, reviews: [] };

export function ProductReviews({ productId }: { productId: string }) {
  const { t, language } = useLocalization();
  const reviewFormId = useId();
  const reviewPhotoInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ProductReviewSummary>(emptySummary);
  const [loading, setLoading] = useState(Boolean(PONYO_API_BASE_URL));
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(Boolean(PONYO_API_BASE_URL));
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reviewPhotos, setReviewPhotos] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [photoMessage, setPhotoMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    void Promise.allSettled([ponyoApi.getProductReviews(productId), ponyoApi.getMe()]).then((results) => {
      if (!active) return;
      const [reviewsResult, accountResult] = results;
      if (reviewsResult.status === "fulfilled") setSummary(reviewsResult.value);
      else setError(reviewsResult.reason instanceof Error ? reviewsResult.reason.message : t("static.product.reviews.unavailable", "Reviews are temporarily unavailable."));
      if (accountResult.status === "fulfilled") setCustomer(accountResult.value);
    }).finally(() => {
      if (active) {
        setLoading(false);
        setCheckingAccount(false);
      }
    });
    return () => { active = false; };
  }, [productId, t]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const review = await ponyoApi.submitProductReview(productId, { rating, title: title.trim(), body: body.trim(), photos: reviewPhotos.map((photo) => photo.dataUrl) });
      setSummary((current) => {
        const existing = current.reviews.find((item) => item.id === review.id);
        const reviews = existing ? current.reviews.map((item) => item.id === review.id ? review : item) : [review, ...current.reviews];
        const averageRating = reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length * 10) / 10 : 0;
        return { averageRating, reviewCount: reviews.length, reviews };
      });
      setMessage(t("static.product.reviews.thanks", "Thanks for sharing your Ponyo find!"));
      setTitle("");
      setBody("");
      setRating(0);
      setReviewPhotos([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("static.product.reviews.save_failed", "Your review could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  return <section className="product-reviews" id="product-reviews" aria-labelledby="product-reviews-title">
    <header className="product-reviews-heading">
      <div><p className="eyebrow">{t("static.product.reviews.eyebrow", "REAL PONYO LOVE")}</p><h2 id="product-reviews-title">{t("static.product.reviews.title", "Customer reviews")}</h2><p>{t("static.product.reviews.subtitle", "Thoughts from the plush-loving Ponyo community.")}</p></div>
      <div className="product-rating-summary" aria-label={`${t("static.product.gallery.rating", "{{rating}} out of 5 stars", { rating: summary.averageRating })} ${t("static.product.gallery.reviews", "{{count}} reviews", { count: summary.reviewCount })}`}>
        <strong>{summary.reviewCount ? summary.averageRating.toFixed(1) : "—"}</strong>
        <span className="product-rating-stars" aria-hidden="true">{summary.reviewCount ? "★★★★★" : "☆☆☆☆☆"}</span>
        <small>{summary.reviewCount === 1 ? t("static.product.gallery.one_review", "{{count}} review", { count: summary.reviewCount }) : t("static.product.gallery.reviews", "{{count}} reviews", { count: summary.reviewCount })}</small>
      </div>
    </header>

    <div className="product-review-content">
      <div className="product-review-list" aria-live="polite">
        {loading ? <p className="product-review-empty">{t("static.product.reviews.loading", "Gathering community reviews…")}</p> : summary.reviews.length ? summary.reviews.map((review) => <ReviewCard key={review.id} review={review} language={language} />) : <div className="product-review-empty"><span aria-hidden="true">♡</span><strong>{t("static.product.reviews.first", "Be the first to review this plush")}</strong><p>{t("static.product.reviews.first_body", "Your note can help another plush find its forever home.")}</p></div>}
      </div>
      <aside className="product-review-form-card">
        <details className="product-review-form-details" id="leave-a-review">
          <summary><span><span className="eyebrow">{t("static.product.reviews.have", "HAVE THIS PLUSH?")}</span><strong>{t("static.product.reviews.leave", "Leave a review")}</strong><small>{t("static.product.reviews.share_community", "Share your experience with the Ponyo community")}</small></span><span className="product-review-summary-icon" aria-hidden="true">＋</span></summary>
          <div className="product-review-form-body">
            <p className="product-review-form-copy">{t("static.product.reviews.form_body", "Share what you love so other plush friends know what to expect.")}</p>
            {checkingAccount ? <p className="product-review-empty">{t("static.product.reviews.checking", "Checking your Ponyo account…")}</p> : customer ? <form id={reviewFormId} onSubmit={submitReview}>
              <fieldset className="product-review-rating"><legend>{t("static.product.reviews.rating", "Your rating")} <span aria-label={t("static.product.reviews.required", "required")}>*</span></legend><div role="group" aria-label={t("static.product.reviews.choose_rating", "Choose a rating from 1 to 5")}>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= rating ? "is-selected" : ""} aria-label={t("static.product.gallery.stars", "{{count}} star rating", { count: value })} aria-pressed={rating === value} onClick={() => setRating(value)}>★</button>)}</div></fieldset>
                      <label>{t("static.product.reviews.title_label", "Review title")} <span className="product-review-optional">{t("static.product.reviews.optional", "Optional")}</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("static.product.reviews.title_placeholder", "The little details I love")} maxLength={140} /></label>
              <label>{t("static.product.reviews.body_label", "Your review")} <span className="product-review-optional">{t("static.product.reviews.optional", "Optional")}</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("static.product.reviews.body_placeholder", "How does your new friend feel at home?")} maxLength={3000} rows={4} /></label>
              <div className="product-review-photo-field"><div><strong>{t("static.product.reviews.add_photos", "Add photos")}</strong><small>{t("static.product.reviews.photo_rules", "Optional · JPEG, up to 5 MB each · 4 photos maximum")}</small></div><input ref={reviewPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label={t("static.product.reviews.choose_photos", "Choose review photos (optional)")} onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                const allowedFiles = files.filter((file) => file.size <= 5 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 4);
                const skippedFiles = files.length - allowedFiles.length;
                void Promise.allSettled(allowedFiles.map(async (file) => {
                  const dataUrl = await optimizeJpegPhoto(file);
                  return dataUrl.length <= 550_000 ? { name: file.name, dataUrl } : null;
                })).then((results) => {
                  const prepared = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
                  const failed = results.length - prepared.length;
                  setReviewPhotos(prepared);
                  const skipped = skippedFiles + failed;
                  setPhotoMessage(skipped ? t(skipped === 1 ? "static.product.reviews.photos_skipped_one" : "static.product.reviews.photos_skipped_other", skipped === 1 ? "{{count}} photo was skipped. Choose image files under 5 MB each." : "{{count}} photos were skipped. Choose image files under 5 MB each.", { count: skipped }) : "");
                  if (reviewPhotoInputRef.current) reviewPhotoInputRef.current.value = "";
                });
              }} />{reviewPhotos.length > 0 && <div className="product-review-photo-list">{reviewPhotos.map((photo, index) => <span key={`${photo.name}-${index}`}><Image src={photo.dataUrl} alt={t("static.product.review.photo", "Review photo: {{name}}", { name: photo.name })} width={64} height={64} unoptimized /><button type="button" aria-label={t("static.product.reviews.remove_photo", "Remove {{name}}", { name: photo.name })} onClick={() => setReviewPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>×</button></span>)}</div>}</div>
              {photoMessage && <p className="product-review-hint" role="status">{photoMessage}</p>}
              {rating === 0 && <p className="product-review-hint">{t("static.product.reviews.choose_star", "Choose a star rating to share your review. Photos are optional.")}</p>}
              {error && <p className="api-form-error" role="alert">{error}</p>}
              {message && <p className="product-form-success" role="status">{message}</p>}
              <button type="submit" className="product-review-submit" disabled={saving || rating === 0}>{saving ? t("static.product.reviews.saving", "Saving your review…") : t("static.product.reviews.submit", "Share my review")}<span aria-hidden="true">→</span></button>
              <small>{t("static.product.reviews.verified_note", "Reviews are linked to your Ponyo account. Purchases are marked when payment is verified.")}</small>
            </form> : <div className="product-review-signin"><p>{t("static.product.reviews.sign_in_body", "Sign in to share a review with the Ponyo community.")}</p><Link className="product-review-submit" href={`/account/login?returnTo=${encodeURIComponent(`/products/${productId}#product-reviews`)}`}>{t("static.product.reviews.sign_in", "Sign in to review")} <span aria-hidden="true">→</span></Link></div>}
          </div>
        </details>
      </aside>
    </div>
  </section>;
}

function ReviewCard({ review, language }: { review: ProductReview; language: string }) {
  const { t } = useLocalization();
  const date = new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(review.createdAt));
  return <article className="product-review-card">
    <header><span className="product-review-avatar" aria-hidden="true">{review.reviewerName.slice(0, 1).toUpperCase()}</span><div><strong>{review.reviewerName}</strong><small>{date}</small></div><span className="product-rating-stars" aria-label={t("static.product.gallery.rating", "{{rating}} out of 5 stars", { rating: review.rating })}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></header>
    {review.verifiedPurchase && <span className="product-verified-purchase">✓ {t("static.product.reviews.verified", "Verified purchase")}</span>}
    {review.title && <h3>{review.title}</h3>}{review.body && <p>{review.body}</p>}
    {review.photos?.length > 0 && <div className="product-review-card-photos" aria-label={t("static.product.reviews.photos", "Customer review photos")}>{review.photos.map((photo, index) => <Image key={index} src={photo} alt={t("static.product.reviews.customer_photo", "Customer photo {{number}}", { number: index + 1 })} width={112} height={112} unoptimized />)}</div>}
  </article>;
}

export function ProductWaitlistForm({ productId, productName }: { productId: string; productName: string }) {
  const { t } = useLocalization();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [checkingAccount, setCheckingAccount] = useState(Boolean(PONYO_API_BASE_URL));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getMe().then((profile) => {
      if (!active) return;
      setFirstName(profile.firstName);
      setEmail(profile.email);
    }).catch(() => {
      // Guests can still join the waitlist with their own contact details.
    }).finally(() => { if (active) setCheckingAccount(false); });
    return () => { active = false; };
  }, []);

  async function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await ponyoApi.joinProductWaitlist(productId, { email: email.trim(), firstName: firstName.trim() });
      setMessage(t("static.product.waitlist.success", "You’re on the {{product}} waitlist. We’ll email you when it’s available.", { product: productName }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("product.waitlist.error", "We couldn't save your waitlist request."));
    } finally {
      setSaving(false);
    }
  }

  return <div className="product-waitlist-layout">
  <section className="product-waitlist" id="product-waitlist" aria-labelledby="product-waitlist-title" tabIndex={-1}>
    <div className="product-waitlist-art" aria-hidden="true"><span>✦</span><span>♡</span></div>
    <p className="eyebrow">{t("product.waitlist.eyebrow", "A LITTLE HEADS-UP")}</p>
    <h2 id="product-waitlist-title">{t("product.waitlist.title", "Join the waitlist")}</h2>
    <p>{t("product.waitlist.card_body", "Leave your details and we’ll save your spot for when {{product}} is ready.", { product: productName })}</p>
    <form onSubmit={joinWaitlist}>
      <label>{t("static.product.waitlist.name", "Your name")}<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" placeholder={t("static.product.waitlist.name_placeholder", "Your name")} maxLength={120} disabled={checkingAccount} /></label>
      <label>{t("product.waitlist.email", "Email address")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder={t("static.account.email_placeholder", "you@example.com")} required maxLength={320} disabled={checkingAccount} /></label>
      {error && <p className="api-form-error" role="alert">{error}</p>}
      {message && <p className="product-form-success" role="status">{message}</p>}
      <button className="product-review-submit" type="submit" disabled={saving || checkingAccount}>{checkingAccount ? t("static.product.waitlist.checking", "Checking your account…") : saving ? t("static.product.waitlist.saving", "Saving your spot…") : t("static.product.waitlist.notify", "Notify me when it’s here")}<span aria-hidden="true">→</span></button>
    </form>
    {checkingAccount && <small>{t("static.product.waitlist.autofill", "Your Ponyo details will fill in automatically. You can edit them.")}</small>}
    <div className="product-waitlist-lineup" aria-hidden="true">
      <span className="product-waitlist-lineup-glow" />
      <span className="product-waitlist-lineup-spark product-waitlist-lineup-spark--one">✦</span>
      <span className="product-waitlist-lineup-spark product-waitlist-lineup-spark--two">✧</span>
      <Image src="/images/waiting-list-transparent.png" alt="" fill loading="eager" unoptimized sizes="(max-width: 767px) 100vw, 560px" />
    </div>
  </section>
  <div className="product-waitlist-side-art" aria-hidden="true">
    <div className="product-waitlist-side-copy">
      <span className="product-waitlist-side-kicker"><span aria-hidden="true">✦</span> {t("static.product.waitlist.lounge", "PONYO WAITLIST LOUNGE")} <span aria-hidden="true">✦</span></span>
      <h3>{t("static.product.waitlist.side_title", "A little magic is on its way")}</h3>
      <p>{t("static.product.waitlist.side_body", "Every good thing is worth waiting for.")}</p>
    </div>
    <div className="product-waitlist-side-panorama">
      <span className="product-waitlist-lineup-glow" />
      <span className="product-waitlist-lineup-spark product-waitlist-lineup-spark--one">✦</span>
      <span className="product-waitlist-lineup-spark product-waitlist-lineup-spark--two">✧</span>
      <svg className="product-waitlist-side-constellation" viewBox="0 0 600 180" fill="none" focusable="false">
        <path className="product-waitlist-starfall" d="m72 20-15 23m130-42-11 19m212-17-14 23m147-7-13 19m-32 84-11 16m-347-7-9 14" />
        <path className="product-waitlist-constellation-star" d="m139 55 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Zm254 52 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Zm127-57 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Zm-386 58 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
        <circle className="product-waitlist-constellation-dot" cx="222" cy="20" r="2" />
        <circle className="product-waitlist-constellation-dot" cx="337" cy="145" r="2.5" />
        <circle className="product-waitlist-constellation-dot" cx="489" cy="113" r="1.7" />
      </svg>
      <Image src="/images/waiting-list-transparent.png" alt="" fill loading="eager" unoptimized sizes="(max-width: 767px) 100vw, 680px" />
    </div>
  </div>
  </div>;
}

export function ProductReservationPanel({
  productId,
  productName,
  reservationsOpen,
}: {
  productId: string;
  productName: string;
  reservationsOpen: boolean;
}) {
  const { deliveryCountries, language, t } = useLocalization();
  const [reservationCount, setReservationCount] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [open, setOpen] = useState(reservationsOpen);
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(Boolean(PONYO_API_BASE_URL));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    void ponyoApi.getProductReservations(productId).then((result) => {
      if (!active) return;
      setReservationCount(result.reservationCount);
      setTarget(result.target);
      setOpen(result.open);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Reservation information is unavailable.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [productId]);

  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await ponyoApi.submitProductReservation(productId, {
        email: email.trim(),
        country,
      });
      setReservationCount(result.reservationCount);
      setTarget(result.target);
      setMessage(t("product.reservation.success", "Your interest is reserved. This is not a purchase, and no payment was taken."));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("product.reservation.error", "Your reservation could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  const progress = target && reservationCount !== null
    ? Math.min(100, Math.round((reservationCount / target) * 100))
    : null;
  const targetReached = target !== null && reservationCount !== null && reservationCount >= target;
  const stage = targetReached
    ? t("product.reservation.status.target_reached", "Reservation target reached")
    : target !== null && reservationCount !== null
      ? t("product.reservation.status.target_not_reached", "Target not reached · collecting reservations")
      : t("product.reservation.status.collecting", "Collecting reservations");

  return <section className="product-reservation" id="product-reservation" aria-labelledby="product-reservation-title">
    <div className="product-reservation-heading">
      <span className="product-reservation-seal" aria-hidden="true">✦</span>
      <div><p className="eyebrow">{t("product.reservation.eyebrow", "A NOTE OF INTEREST · NO PAYMENT")}</p><h2 id="product-reservation-title">{t("product.reservation.title", "Reserve your interest")}</h2></div>
    </div>
    {loading ? <p className="product-reservation-status">{t("product.reservation.loading", "Loading the live reservation count…")}</p>
      : reservationCount !== null && <div className="product-reservation-counter" aria-live="polite">
        <strong>{reservationCount}{target ? <span> / {target}</span> : ""}</strong>
        <span>{reservationCount === 1
          ? t("product.reservation.people_one", "{{count}} person has reserved interest", { count: reservationCount })
          : t("product.reservation.people_other", "{{count}} people have reserved interest", { count: reservationCount })}</span>
        <span className={`product-reservation-stage${targetReached ? " is-reached" : ""}`}>{stage}</span>
        {progress !== null && <><div className="product-reservation-progress" role="progressbar" aria-label={t("product.reservation.progress_label", "Reservation target reached")} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div><small>{t("product.reservation.progress", "{{progress}}% of the reservation target reached", { progress })}</small></>}
        {target === null && <small>{t("product.reservation.target_not_set", "No reservation target has been set for this product yet.")}</small>}
      </div>}
    {!open ? <p className="product-reservation-status">{t("product.reservation.closed", "Reservations are not open for this piece yet.")}</p>
      : !PONYO_API_BASE_URL ? <p className="product-reservation-status" role="status">{t("product.reservation.service_unavailable", "The reservation service is not configured right now.")}</p>
      : <form onSubmit={reserve}>
        <label>{t("product.reservation.email", "Email address")}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("static.account.email_placeholder", "you@example.com")} required maxLength={320} /></label>
        <label>{t("product.reservation.country", "Country")}<select autoComplete="country-name" value={country} onChange={(event) => setCountry(event.target.value)} required><option value="">{t("product.reservation.select_country", "Select your country")}</option>{deliveryCountries.map((item) => <option key={item.code} value={item.code}>{regionName(item.code, language, item.label)}</option>)}</select></label>
        {error && <p className="api-form-error" role="alert">{error}</p>}
        {message && <p className="product-form-success" role="status">{message}</p>}
        <button className="product-review-submit" type="submit" disabled={saving}>{saving ? t("product.reservation.saving", "Saving your interest…") : t("product.reservation.submit", "Reserve my interest")}<span aria-hidden="true">→</span></button>
      </form>}
    <p className="product-reservation-disclaimer">{t("product.reservation.disclaimer", "{{product}} reservations only record interest. They are non-binding, do not create an order, and require no payment.", { product: productName })}</p>
  </section>;
}
