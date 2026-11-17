"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";

type ConsentChoice = "necessary" | "all" | "custom";

export function CookieConsentBanner({ initialConsent, initialAnalyticsConsent = false, initialMarketingConsent = false }: { initialConsent: ConsentChoice | null; initialAnalyticsConsent?: boolean; initialMarketingConsent?: boolean }) {
	const { t } = useLocalization();
	const [consent, setConsent] = useState<ConsentChoice | null>(initialConsent);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [readyToShow, setReadyToShow] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [analyticsEnabled, setAnalyticsEnabled] = useState(initialAnalyticsConsent);
	const [marketingEnabled, setMarketingEnabled] = useState(initialMarketingConsent);
	const dialogRef = useRef<HTMLElement>(null);
	const firstActionRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (initialConsent) return;
		const revealTimer = window.setTimeout(() => setReadyToShow(true), 250);
		return () => window.clearTimeout(revealTimer);
	}, [initialConsent]);

	useEffect(() => {
		if (consent || !readyToShow) return;
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		firstActionRef.current?.focus();
		return () => { document.body.style.overflow = previousOverflow; };
	}, [consent, detailsOpen, readyToShow]);

	async function chooseConsent(choice: ConsentChoice, allowAnalytics = false, allowMarketing = false) {
		setIsSaving(true);
		setSaveError(false);
		try {
			const response = await fetch("/api/preferences", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cookieConsent: choice, optionalAnalytics: allowAnalytics, optionalMarketing: allowMarketing }),
			});
			if (!response.ok) throw new Error("Unable to save cookie preference");
			setIsLeaving(true);
			window.setTimeout(() => setConsent(choice), 240);
		} catch {
			setSaveError(true);
		} finally {
			setIsSaving(false);
		}
	}

	function trapTabKey(event: React.KeyboardEvent<HTMLElement>) {
		if (event.key !== "Tab") return;
		const controls = dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
		if (!controls?.length) return;
		const first = controls[0];
		const last = controls[controls.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	if (consent || !readyToShow) return null;

	return (
		<div className="cookie-consent-layer">
			<aside ref={dialogRef} className={`cookie-consent-banner${isLeaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title" aria-describedby="cookie-consent-description" aria-live="polite" tabIndex={-1} onKeyDown={trapTabKey}>
				<div className="cookie-consent-mark" aria-hidden="true">🪼</div>
				<div className="cookie-consent-copy">
					<strong id="cookie-consent-title">{t("cookies.title", "Your cookie choices matter")}</strong>
					<p id="cookie-consent-description">{t("cookies.description", "Cookies help Ponyo remember your language, currency, and delivery region and keep the shop working. With your permission, optional cookies can also help us understand how the shop is used and improve marketing. Optional tracking is currently inactive in this preview. Choose Accept all, Reject all non-essential, or customize your settings below.")}</p>
					{detailsOpen && <div className="cookie-consent-settings-panel">
						<label className="cookie-consent-toggle"><span><b>{t("cookies.essential", "Essential")}</b><small>{t("cookies.essential_description", "Required for security and core shop features")}</small></span><input type="checkbox" checked disabled aria-label={t("cookies.essential_always_on", "Essential cookies are always on")} /><i>{t("cookies.always_on", "Always on")}</i></label>
						<label className="cookie-consent-toggle"><span><b>{t("cookies.preferences", "Preferences")}</b><small>{t("cookies.preferences_description", "Remember your language, currency, and delivery region")}</small></span><input type="checkbox" checked disabled aria-label={t("cookies.preferences_always_on", "Preference cookies are always on")} /><i>{t("cookies.always_on", "Always on")}</i></label>
						<label className="cookie-consent-toggle"><span><b>{t("cookies.analytics", "Analytics")}</b><small>{t("cookies.analytics_description", "Help us understand how the shop is used (not active in this preview)")}</small></span><input type="checkbox" checked={analyticsEnabled} onChange={(event) => setAnalyticsEnabled(event.target.checked)} aria-label={t("cookies.allow_analytics", "Allow optional analytics cookies")} /></label>
						<label className="cookie-consent-toggle"><span><b>{t("cookies.marketing", "Marketing")}</b><small>{t("cookies.marketing_description", "Personalize promotions (not active in this preview)")}</small></span><input type="checkbox" checked={marketingEnabled} onChange={(event) => setMarketingEnabled(event.target.checked)} aria-label={t("cookies.allow_marketing", "Allow optional marketing cookies")} /></label>
					</div>}
				</div>
				<div className="cookie-consent-actions">
					{detailsOpen ? <>
						<button ref={firstActionRef} type="button" className="cookie-consent-settings" disabled={isSaving} onClick={() => setDetailsOpen(false)}>{t("cookies.back", "Back")}</button>
						<button type="button" className="cookie-consent-necessary" disabled={isSaving} onClick={() => void chooseConsent("custom", analyticsEnabled, marketingEnabled)}>{t("cookies.save_choices", "Save my choices")}</button>
					</> : <>
						<button ref={firstActionRef} type="button" className="cookie-consent-accept" disabled={isSaving} onClick={() => void chooseConsent("all", true, true)}>{t("cookies.accept_all", "Accept all")}</button>
						<button type="button" className="cookie-consent-necessary" disabled={isSaving} onClick={() => void chooseConsent("necessary")}>{t("cookies.reject_nonessential", "Reject all non-essential")}</button>
						<button type="button" className="cookie-consent-settings" disabled={isSaving} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(true)}>{t("cookies.settings", "Cookie settings")}</button>
					</>}
				</div>
				{saveError && <p className="cookie-consent-error" role="alert">{t("cookies.save_error", "Couldn’t save your choice. Please try again.")}</p>}
			</aside>
		</div>
	);
}
