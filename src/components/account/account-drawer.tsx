"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AccountAuthForm } from "@/components/account/account-auth-form";
import { useLocalization } from "@/components/layout/localization-provider";
import { ponyoApi } from "@/services/ponyo-api.client";
import { useCustomerSession } from "@/components/layout/customer-session-provider";

export function AccountDrawer() {
  const { t } = useLocalization();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const { customer, isLoading, setCustomer: setSessionCustomer } = useCustomerSession();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open && customer) {
      dialogRef.current?.close();
      router.push("/account");
    }
  }, [customer, open, router]);

  useEffect(() => {
    const openAccount = () => {
      if (customer) {
        setOpen(false);
        router.push("/account");
        return;
      }
      setSessionError("");
      setAuthMode(null);
      setOpen(true);
    };
    window.addEventListener("ponyo:account-open", openAccount);
    return () => window.removeEventListener("ponyo:account-open", openAccount);
  }, [customer, router]);

  async function signOut() {
    setSigningOut(true);
    setSessionError("");
    try {
      await ponyoApi.logout();
      setSessionCustomer(null);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : t("static.account.dashboard.sign_out_failed", "Unable to sign out right now."));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="account-drawer"
      aria-label={t("static.account.drawer.label", "Your Ponyo account")}
      onClose={() => setOpen(false)}
      onClick={(event) => { if (event.target === dialogRef.current) setOpen(false); }}
    >
      <header className="account-drawer-heading">
        <div><span className="account-auth-eyebrow">{t("static.account.drawer.kicker", "A LITTLE HOME FOR YOUR PLUSH")}</span><h2>{t("static.account.drawer.title", "Your Ponyo account")}</h2></div>
        <button type="button" className="account-drawer-close" aria-label={t("static.account.drawer.close", "Close account panel")} onClick={() => setOpen(false)}>×</button>
      </header>
      <div className="account-drawer-body">
        {sessionError && <p className="api-form-error" role="alert">{sessionError}</p>}
        {open && isLoading && <p className="account-drawer-loading" role="status">{t("static.account.drawer.loading", "Checking your account…")}</p>}

        {!isLoading && customer ? <section className="account-drawer-profile account-drawer-profile--signed-in" aria-label={t("static.account.drawer.signed_in", "Signed-in account")}>
          <span className="account-drawer-avatar" aria-hidden="true">🪼</span>
          <div><p className="account-auth-eyebrow">{t("static.account.drawer.welcome", "WELCOME BACK")}</p><h3>{t("static.account.dashboard.greeting", "Hello, {{name}}!", { name: customer.firstName || t("static.account.dashboard.guest", "plush friend") })}</h3><p className="account-drawer-email">{customer.email}</p></div>
        </section> : !isLoading && !authMode && <section className="account-drawer-profile account-drawer-profile--guest" aria-label={t("static.account.drawer.guest", "Guest account")}>
          <span className="account-drawer-avatar" aria-hidden="true">🪼</span>
          <div><p className="account-auth-eyebrow">{t("static.account.drawer.kicker", "A LITTLE HOME FOR YOUR PLUSH")}</p><h3>{t("static.account.drawer.title", "Your Ponyo account")}</h3><p className="account-drawer-email">{t("static.account.drawer.sign_in_body", "Sign in to follow orders, save favorites, and find your next forever plush.")}</p></div>
          <div className="account-drawer-auth-actions">
            <button type="button" className="account-drawer-primary" onClick={() => setAuthMode("login")}>{t("static.account.drawer.sign_in", "Sign in")}</button>
            <button type="button" className="account-drawer-secondary" onClick={() => setAuthMode("register")}>{t("static.account.drawer.create", "Create account")}</button>
          </div>
        </section>}

        {authMode && !customer && <section className="account-drawer-auth-panel" aria-label={authMode === "register" ? t("static.account.drawer.create_label", "Create your account") : t("static.account.drawer.sign_in_label", "Sign in")}>
          <button type="button" className="account-drawer-back" onClick={() => setAuthMode(null)}>{t("static.account.drawer.overview", "← Account overview")}</button>
          <AccountAuthForm key={authMode} mode={authMode} presentation="drawer" showDrawerTabs={false} onAuthenticated={(profile) => { setSessionCustomer(profile); setAuthMode(null); setOpen(false); router.push("/"); }} onClose={() => setOpen(false)} />
        </section>}

        <section className="account-drawer-links" aria-label={t("static.account.drawer.shortcuts", "Account shortcuts")}>
          <AccountLinkGroup title={t("static.account.drawer.orders", "Your orders")} seeAll={t("static.account.drawer.see_all", "See all")} links={[
            { label: t("static.account.drawer.track", "Track & manage orders"), detail: t("static.account.drawer.track_body", "Check delivery and order status"), href: "/orders", icon: "▤" },
            { label: t("static.account.drawer.buy_again", "Buy again"), detail: t("static.account.drawer.buy_again_body", "Find another plush to love"), href: "/collections/all", icon: "↻" },
            { label: t("static.account.drawer.returns", "Returns & order help"), detail: t("static.account.drawer.returns_body", "We’re here if something isn’t right"), href: "/pages/contact", icon: "↩" },
          ]} onNavigate={() => setOpen(false)} />
          <AccountLinkGroup title={t("static.account.drawer.your_ponyo", "Your Ponyo")} seeAll={t("static.account.drawer.see_all", "See all")} links={[
            { label: t("static.account.drawer.saved", "Saved plush"), detail: t("static.account.drawer.saved_body", "Your wishlist favorites"), href: "/wishlist", icon: "♡" },
            { label: t("static.account.drawer.addresses", "Delivery addresses"), detail: t("static.account.drawer.addresses_body", "Manage where plush goes"), href: "/account/addresses", icon: "⌖" },
          ]} onNavigate={() => setOpen(false)} />
          <AccountLinkGroup title={t("static.account.drawer.help", "Need a hand?")} seeAll={t("static.account.drawer.see_all", "See all")} links={[
            { label: t("static.account.drawer.shipping", "Shipping rates & policies"), detail: t("static.account.drawer.shipping_body", "Delivery details and answers"), href: "/pages/faq", icon: "◇" },
            { label: t("static.account.drawer.contact", "Contact Ponyo"), detail: t("static.account.drawer.contact_body", "Talk to our little plush-loving team"), href: "/pages/contact", icon: "✉" },
          ]} onNavigate={() => setOpen(false)} />
        </section>

        {customer && <button type="button" className="account-drawer-signout" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? t("static.account.dashboard.signing_out", "Signing out…") : t("static.account.sign_out", "Sign out")}</button>}
      </div>
    </dialog>
  );
}

function AccountLinkGroup({ title, links, seeAll, onNavigate }: { title: string; links: Array<{ label: string; detail: string; href: string; icon: string }>; seeAll: string; onNavigate: () => void }) {
  return <section className="account-drawer-link-group" aria-label={title}>
    <header><h3>{title}</h3>{links[0]?.href === "/orders" && <Link href="/orders" onClick={onNavigate}>{seeAll}</Link>}</header>
    <nav>{links.map((link) => <Link href={link.href} key={link.label} onClick={onNavigate}><span className="account-drawer-link-icon" aria-hidden="true">{link.icon}</span><span className="account-drawer-link-copy"><strong>{link.label}</strong><small>{link.detail}</small></span><span className="account-drawer-link-arrow" aria-hidden="true">›</span></Link>)}</nav>
  </section>;
}
