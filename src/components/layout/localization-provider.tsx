"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { currencies, deliveryCountries, getDeliveryLocalization, isDeliveryCountryCode, languages } from "@/lib/localization-options";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

type RatePayload = { base: string; date: string; rates: Record<string, number> };
type LocalizationContextValue = {
  language: string;
  currency: string;
  country: string;
  deliveryNoticeDismissed: boolean;
  languages: typeof languages;
  currencies: typeof currencies;
  deliveryCountries: typeof deliveryCountries;
  rates: Record<string, number>;
  rateStatus: "loading" | "ready" | "error";
  refreshRates: () => Promise<void>;
  setLanguage: (language: string) => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  setDeliveryCountry: (country: string) => Promise<void>;
  dismissDeliveryNotice: () => Promise<void>;
  t: (key: string, fallback: string, values?: Record<string, string | number>) => string;
  formatPrice: (amount: number, sourceCurrency?: string) => string;
  convertMajorAmount: (amount: number, sourceCurrency?: string) => number;
};

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

function hasRequiredRates(payload: RatePayload | undefined, symbols: string[]): payload is RatePayload {
  return Boolean(
    payload?.base === "JPY" &&
      symbols.every((code) => Number.isFinite(payload.rates?.[code]) && payload.rates[code] > 0),
  );
}

async function requestRates(symbols: string[]): Promise<RatePayload> {
  if (PONYO_API_BASE_URL) {
    try {
      const payload = await ponyoApi.getLocalizationRates(symbols.join(","));
      if (hasRequiredRates(payload, symbols)) return payload;
    } catch {
      // Fall back to the same-origin endpoint if the configured API is unavailable.
    }
  }

  const response = await fetch(`/api/localization/rates?symbols=${encodeURIComponent(symbols.join(","))}`);
  if (!response.ok) throw new Error("Unable to load currency exchange rates.");
  const payload = (await response.json()) as { data?: RatePayload };
  if (!hasRequiredRates(payload.data, symbols)) throw new Error("Currency exchange rates are incomplete.");
  return payload.data;
}

export function LocalizationProvider({ children, initialLanguage = "ja", initialCurrency = "JPY", initialCountry = "JP", initialDeliveryNoticeDismissed = false }: { children: ReactNode; initialLanguage?: string; initialCurrency?: string; initialCountry?: string; initialDeliveryNoticeDismissed?: boolean }) {
  const router = useRouter();
  const intlTranslate = useTranslations();
  const [language, setLanguageState] = useState(languages.some((item) => item.code === initialLanguage) ? initialLanguage : "en");
  const [currency, setCurrencyState] = useState(currencies.some((item) => item.code === initialCurrency) ? initialCurrency : "JPY");
  const [country, setCountryState] = useState(isDeliveryCountryCode(initialCountry) ? initialCountry : "JP");
  const [deliveryNoticeDismissed, setDeliveryNoticeDismissed] = useState(initialDeliveryNoticeDismissed);
  const [rates, setRates] = useState<Record<string, number>>({ JPY: 1 });
  const [rateStatus, setRateStatus] = useState<"loading" | "ready" | "error">("loading");
  const rateRequest = useRef<Promise<void> | null>(null);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const refreshRates = useCallback(() => {
    if (rateRequest.current) return rateRequest.current;
    const symbols = currencies.map((item) => item.code).filter((code) => code !== "JPY");
    const request = (async () => {
      setRateStatus("loading");
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const payload = await requestRates(symbols);
          setRates({ JPY: 1, ...payload.rates });
          setRateStatus("ready");
          return;
        } catch {
          if (attempt < 2) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 750 * 2 ** attempt));
          }
        }
      }
      setRateStatus("error");
    })().finally(() => {
      rateRequest.current = null;
    });
    rateRequest.current = request;
    return request;
  }, []);

  useEffect(() => {
    void refreshRates();
  }, [refreshRates]);

  const savePreference = useCallback(async (next: { language?: string; currency?: string; country?: string; deliveryNoticeDismissed?: boolean }) => {
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Unable to save localization preference");
    } catch { /* selection remains active in this tab when preference storage is unavailable */ }
  }, []);

  const setLanguage = useCallback(async (next: string) => {
    if (!languages.some((item) => item.code === next)) return;
    setLanguageState(next);
    await savePreference({ language: next });
    router.refresh();
  }, [router, savePreference]);

  const setCurrency = useCallback(async (next: string) => {
    if (!currencies.some((item) => item.code === next)) return;
    setCurrencyState(next);
    if (next !== "JPY" && !rates[next] && rateStatus === "error") void refreshRates();
    await savePreference({ currency: next });
  }, [rateStatus, rates, refreshRates, savePreference]);

  const setDeliveryCountry = useCallback(async (next: string) => {
    if (!isDeliveryCountryCode(next)) return;
    const defaults = getDeliveryLocalization(next);
    setCountryState(next);
    setLanguageState(defaults.language);
    setCurrencyState(defaults.currency);
    await savePreference({ country: next, language: defaults.language, currency: defaults.currency });
    router.refresh();
  }, [router, savePreference]);

  const dismissDeliveryNotice = useCallback(async () => {
    setDeliveryNoticeDismissed(true);
    await savePreference({ deliveryNoticeDismissed: true });
  }, [savePreference]);

  const convertMajorAmount = useCallback((amount: number, sourceCurrency = "JPY") => {
    const source = sourceCurrency.toUpperCase();
    if (source === currency) return amount;
    const sourceRate = rates[source];
    const targetRate = rates[currency];
    if (!sourceRate || !targetRate) return amount;
    return amount / sourceRate * targetRate;
  }, [currency, rates]);

  const formatPrice = useCallback((amount: number, sourceCurrency = "JPY") => {
    const source = sourceCurrency.toUpperCase();
    const hasConversionRate = source === currency || Boolean(rates[source] && rates[currency]);
    const displayCurrency = hasConversionRate ? currency : source;
    const selected = currencies.find((item) => item.code === displayCurrency);
    const localizedAmount = hasConversionRate ? convertMajorAmount(amount, source) : amount;
    const formatterLocale = language === "en" ? "en-US" : language === "es" ? "es-ES" : language === "pt-BR" ? "pt-BR" : language === "pt-PT" ? "pt-PT" : language;
    const formatOptions: Intl.NumberFormatOptions = {
      style: "currency",
      currency: displayCurrency,
      ...(selected ? { minimumFractionDigits: selected.digits, maximumFractionDigits: selected.digits } : {}),
    };
    try {
      return new Intl.NumberFormat(formatterLocale, formatOptions).format(localizedAmount);
    } catch {
      return new Intl.NumberFormat("en-US", formatOptions).format(localizedAmount);
    }
  }, [convertMajorAmount, currency, language, rates]);

  const t = useCallback((key: string, _fallback: string, values?: Record<string, string | number>) => {
    return intlTranslate.has(key) ? intlTranslate(key, values) : key;
  }, [intlTranslate]);

  const contextValue = useMemo(() => ({ language, currency, country, deliveryNoticeDismissed, languages, currencies, deliveryCountries, rates, rateStatus, refreshRates, setLanguage, setCurrency, setDeliveryCountry, dismissDeliveryNotice, t, formatPrice, convertMajorAmount }), [language, currency, country, deliveryNoticeDismissed, rates, rateStatus, refreshRates, setLanguage, setCurrency, setDeliveryCountry, dismissDeliveryNotice, t, formatPrice, convertMajorAmount]);
  return <LocalizationContext.Provider value={contextValue}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const value = useContext(LocalizationContext);
  if (!value) throw new Error("useLocalization must be used inside LocalizationProvider");
  return value;
}

export function LocalizedText({ translationKey, fallback, values, as, ...props }: { translationKey: string; fallback: string; values?: Record<string, string | number>; as?: ElementType } & HTMLAttributes<HTMLElement>) {
  const { t } = useLocalization();
  const Tag = as ?? "span";
  const elementProps = props;
  return <Tag {...elementProps}>{t(translationKey, fallback, values)}</Tag>;
}

export function LocalizedPrice({ amount, sourceCurrency = "JPY", className }: { amount: number; sourceCurrency?: string; className?: string }) {
  const { formatPrice } = useLocalization();
  return <span className={className}>{formatPrice(amount, sourceCurrency)}</span>;
}
