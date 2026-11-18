"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readCart, saveCart, useCartItems, type CartItem } from "@/lib/cart";
import { cartValidationKey, refreshCartItems, type ValidatedCartItem } from "@/lib/cart-validation";
import { PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { useLocalization } from "@/components/layout/localization-provider";
import { LocalCheckoutLink } from "@/components/layout/local-checkout-link";

export function CartPageClient() {
  const { currency, formatPrice, convertMajorAmount, t } = useLocalization();
  const items = useCartItems();
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + convertMajorAmount(item.price * item.qty, item.currency), 0), [convertMajorAmount, items]);
  const quantity = items.reduce((sum, item) => sum + item.qty, 0);
  const snapshotKey = cartValidationKey(items, currency);
  const [retry, setRetry] = useState(0);
  const [check, setCheck] = useState({ key: "", retry: -1, ready: false, message: "" });
  const checking = Boolean(PONYO_API_BASE_URL) && (check.key !== snapshotKey || check.retry !== retry);
  const blocked = Boolean(PONYO_API_BASE_URL) && (checking || !check.ready);

  useEffect(() => {
    if (!PONYO_API_BASE_URL || !JSON.parse(snapshotKey)[1].length) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const current = readCart();
      if (cartValidationKey(current, currency) !== snapshotKey) return;
      const original = JSON.stringify(current);
      void refreshCartItems(current, currency).then((result) => {
        if (!active) return;
        if (JSON.stringify(readCart()) !== original) {
          setCheck({ key: snapshotKey, retry, ready: false, message: t("cart.retry_cart_changed", "Your cart changed. Please try again.") });
          return;
        }
        if (JSON.stringify(result.items) !== original) saveCart(result.items);
        const priceChanged = result.validation?.items.some((line) => line.priceChanged);
        setCheck({ key: snapshotKey, retry, ready: Boolean(result.validation?.canCheckout), message: priceChanged ? t("cart.prices_changed", "Some prices have changed. Review your cart before continuing.") : result.validation?.canCheckout ? "" : t("cart.unavailable_items", "Some items are unavailable at the selected quantity.") });
      }).catch(() => {
        if (active) setCheck({ key: snapshotKey, retry, ready: false, message: t("cart.refresh_failed", "We couldn’t update your cart right now. Please try again.") });
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [snapshotKey, currency, retry, t]);

  function update(next: CartItem[]) {
    saveCart(next);
    window.dispatchEvent(new CustomEvent("ponyo:local-cart-update", { detail: next }));
  }

  return (
    <div className={`store-container cart-page-content${items.length ? " has-items" : " is-empty"}`}>
      <header className="cart-page-heading">
        <div><p className="eyebrow">{t("cart.eyebrow", "A LITTLE BUNDLE OF JOY")}</p><h1>{t(items.length ? "cart.title" : "cart.waiting_title", items.length ? "Your cart" : "Your cart is waiting")}</h1><p>{items.length ? t(quantity === 1 ? "cart.items_body_one" : "cart.items_body_other", "{{count}} lovely finds, ready for their new home.", { count: quantity }) : t("cart.empty_body", "A forever friend is just around the corner.")}</p></div>
        <Link href="/collections/all" className="cart-continue-link"><span aria-hidden="true">←</span> {t("cart.keep_exploring", "Keep exploring")}</Link>
      </header>

      {items.length === 0 ? <section className="cart-empty-state">
        <div className="cart-empty-art" aria-hidden="true"><span>♡</span><i>✦</i><b>🪼</b></div>
        <p className="cart-empty-eyebrow">{t("cart.empty_eyebrow", "YOUR NEXT FOREVER FRIEND")}</p>
        <h2>{t("cart.empty_title", "There’s room for something lovely.")}</h2>
        <p>{t("cart.empty_description", "Discover rare finds, premium favorites, and oversized companions picked with care.")}</p>
        <Link className="shop-button shop-button-orange" href="/collections/all">{t("cart.explore_collection", "Explore the collection")} <b>→</b></Link>
        <nav className="cart-empty-links" aria-label={t("cart.explore_categories", "Explore plush categories")}><Link href="/collections/all">{t("cart.all_plush", "All plush")}</Link><Link href="/collections/bears">{t("cart.bears", "Bears")}</Link><Link href="/collections/bunnies">{t("cart.bunnies", "Bunnies")}</Link><Link href="/collections/domina-xl">{t("cart.domina", "Domina XL")}</Link></nav>
      </section> : <div className="cart-page-layout">
        <section className="cart-line-list" aria-label={t("cart.items_label", "Items in your cart")}>
          <div className="cart-items-heading"><span>{t("cart.picked", "Plush picked for you")}</span><span>{quantity} {t(quantity === 1 ? "cart.item_one" : "cart.item_other", quantity === 1 ? "item" : "items")}</span></div>
          {items.map((item: ValidatedCartItem) => <article className="cart-line" key={item.id}>
            {item.catalogId ? <Link href={`/products/${item.catalogId}`} className="cart-line-image"><CartLineImage key={item.image} item={item} /></Link> : <span className="cart-line-image"><CartLineImage key={item.image} item={item} /></span>}
            <div className="cart-line-info">
              <span className="cart-line-maker">{item.maker}</span>
              {item.catalogId ? <Link href={`/products/${item.catalogId}`} className="cart-line-name">{item.name}</Link> : <span className="cart-line-name">{item.name}</span>}
              <span className="cart-line-ready"><i aria-hidden="true" /> {PONYO_API_BASE_URL ? checking ? t("cart.confirming", "Confirming availability…") : item.availability === "unavailable" ? t("cart.unavailable_quantity", "Unavailable for this quantity") : t("cart.ready_to_order", "Ready to order") : t("cart.ready", "Ready to be loved")}</span>
              {PONYO_API_BASE_URL && item.validationIssue && <p role="alert">{item.validationIssue.includes("product_unavailable") ? t("cart.validation.product_unavailable", "This product is no longer available. Please remove it.") : item.validationIssue.includes("insufficient_stock") ? t("cart.validation.insufficient_stock", "Only {{count}} available. Reduce the quantity or remove this item.", { count: item.availableQuantity ?? 0 }) : item.validationIssue.includes("mixed_currency") ? t("cart.validation.mixed_currency", "These items have different source currencies and cannot be checked out together.") : t("cart.validation.price_changed", "Price or currency updated. Please review the current price.")}</p>}
              <strong className="cart-line-unit-price">{formatPrice(item.price, item.currency)} <small>{t("cart.each", "each")}</small></strong>
              <div className="cart-line-controls" aria-label={t("cart.quantity_for", "Quantity for {{name}}", { name: item.name })}>
                <button type="button" aria-label={t("cart.decrease", "Decrease {{name}} quantity", { name: item.name })} disabled={item.qty <= 1} onClick={() => update(items.map((entry) => entry.id === item.id ? { ...entry, qty: Math.max(1, entry.qty - 1) } : entry))}>−</button>
                <span aria-live="polite">{item.qty}</span>
                <button type="button" aria-label={t("cart.increase", "Increase {{name}} quantity", { name: item.name })} disabled={item.qty >= 99} onClick={() => update(items.map((entry) => entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry))}>＋</button>
                <button type="button" className="cart-remove cart-remove--icon" aria-label={t("cart.remove_name", "Remove {{name}} from cart", { name: item.name })} title={t("cart.remove_title", "Remove item")} onClick={() => update(items.filter((entry) => entry.id !== item.id))}><CartTrashIcon /><span className="sr-only">{t("cart.remove_title", "Remove item")}</span></button>
              </div>
            </div>
            <strong className="cart-line-total">{formatPrice(item.price * item.qty, item.currency)}</strong>
          </article>)}
          <div className="cart-bottom-promise"><span aria-hidden="true">✦</span><p><strong>{t("cart.promise_title", "A thoughtful pick, packed with care.")}</strong><small>{t("cart.promise_body", "Every Ponyo plush is chosen to bring a little more joy home.")}</small></p></div>
        </section>

        <aside className="cart-summary" aria-labelledby="cart-summary-title">
          <div className="cart-summary-heading"><div><p className="eyebrow">{t("cart.summary_eyebrow", "ALMOST YOURS")}</p><h2 id="cart-summary-title">{t("cart.summary_title", "Order summary")}</h2></div><span className="cart-summary-count">{quantity}</span></div>
          <div className="cart-summary-line"><span>{t("cart.subtotal", "Subtotal")}</span><strong>{formatPrice(subtotal, currency)}</strong></div>
          <div className="cart-summary-line"><span>{t("cart.shipping", "Shipping")}</span><span className="cart-shipping-value">{t("cart.shipping_calculated", "Calculated at checkout")}</span></div>
          <p className="cart-summary-tax">{t("cart.tax_note", "Taxes and delivery are confirmed for your Japan address at checkout.")}</p>
          {PONYO_API_BASE_URL && !checking && !check.ready && check.message && <div role="alert"><p>{check.message}</p><button type="button" className="cart-continue-link" onClick={() => setRetry((value) => value + 1)}>{t("cart.try_again", "Try again")}</button></div>}
          {blocked ? <button type="button" disabled className="shop-button shop-button-orange cart-checkout-button">{checking ? t("cart.reviewing", "Reviewing your cart…") : t("cart.review_before_checkout", "Review cart before checkout")}</button> : <LocalCheckoutLink className="shop-button shop-button-orange cart-checkout-button">{t("cart.continue_checkout", "Continue to checkout")} <b>→</b></LocalCheckoutLink>}
          <div className="cart-secure-note"><span aria-hidden="true">♧</span><span>{t("cart.secure_checkout", "Secure checkout · Your payment details stay protected")}</span></div>
          <Link className="cart-back-to-shop" href="/collections/all">{t("cart.continue_discovering", "Continue discovering plush")} <span aria-hidden="true">→</span></Link>
        </aside>
      </div>}
    </div>
  );
}

function CartTrashIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9 7V4.8h6V7m2.8 0-.8 13H7L6.2 7m3.3 3.2v6.2m4.9-6.2v6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CartLineImage({ item }: { item: CartItem }) {
  const [source, setSource] = useState(item.image);
  return <img src={source} alt={item.imageAlt} // eslint-disable-line @next/next/no-img-element
    onError={() => {
    if (source !== "/images/plushies-home-2.png") setSource("/images/plushies-home-2.png");
  }} />;
}
