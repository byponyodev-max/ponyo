import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Libre_Baskerville, Nunito_Sans } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { CookieConsentBanner } from "@/components/layout/cookie-consent-banner";
import { LocalizationProvider } from "@/components/layout/localization-provider";
import { CustomerSessionProvider } from "@/components/layout/customer-session-provider";
import { currencies, getDeliveryLocalization, languages, resolveDeliveryCountry } from "@/lib/localization-options";
import "./globals.css";
import "./ponyo-foundation.css";
import "./storefront.css";
import "./theme-parity.css";
import "./theme-parity-polish.css";
import "./collection-theme.css";
import "./auth-studio.css";
import "./orders-studio.css";
import "./product-card-actions.css";
import "./home-size-spotlight.css";
import "./footer-experience.css";
import "./domina-responsive.css";
import "./supplier-portal.css";
import "./admin-portal.css";
import "./maker-reservation.css";

const bodyFont = Nunito_Sans({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const headingFont = Libre_Baskerville({ subsets: ["latin"], weight: ["700"], variable: "--font-libre-baskerville", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Ponyo — Your World of Cuteness",
    template: "%s | Ponyo",
  },
  description: "Rare finds, premium favorites, and giant plush companions—hand-picked for you.",
  icons: {
    icon: "/ponyo-jellyfish.svg",
    shortcut: "/ponyo-jellyfish.svg",
    apple: "/ponyo-jellyfish.svg",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const savedLanguage = cookieStore.get("ponyo-language")?.value;
  const initialCountry = resolveDeliveryCountry(cookieStore.get("ponyo-country")?.value, [
    requestHeaders.get("cf-ipcountry"),
    requestHeaders.get("x-vercel-ip-country"),
  ]);
  const countryLocalization = getDeliveryLocalization(initialCountry);
  const savedCurrency = cookieStore.get("ponyo-currency")?.value;
  const initialLanguage = languages.some((language) => language.code === savedLanguage) ? savedLanguage! : countryLocalization.language;
  const initialCurrency = currencies.some((currency) => currency.code === savedCurrency) ? savedCurrency! : countryLocalization.currency;
  const initialDeliveryNoticeDismissed = cookieStore.get("ponyo-delivery-notice-dismissed")?.value === "1";
  const savedCookieConsent = cookieStore.get("ponyo-cookie-consent")?.value;
  const initialCookieConsent = savedCookieConsent === "all" || savedCookieConsent === "necessary" || savedCookieConsent === "custom" ? savedCookieConsent : null;
  const initialAnalyticsConsent = cookieStore.get("ponyo-analytics-consent")?.value === "1";
  const initialMarketingConsent = cookieStore.get("ponyo-marketing-consent")?.value === "1";
  return (
    <html lang={initialLanguage} className="h-full antialiased">
      <body className={`min-h-full ${bodyFont.variable} ${headingFont.variable}`}>
        <NextIntlClientProvider>
          <LocalizationProvider initialLanguage={initialLanguage} initialCurrency={initialCurrency} initialCountry={initialCountry} initialDeliveryNoticeDismissed={initialDeliveryNoticeDismissed}>
            <CustomerSessionProvider>
              <CookieConsentBanner initialConsent={initialCookieConsent} initialAnalyticsConsent={initialAnalyticsConsent} initialMarketingConsent={initialMarketingConsent} />
              {children}
            </CustomerSessionProvider>
          </LocalizationProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
