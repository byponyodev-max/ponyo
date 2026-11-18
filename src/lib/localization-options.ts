export type LanguageOption = {
	code: string;
	label: string;
	country: string;
	badge: string;
};
export type CurrencyOption = {
	code: string;
	label: string;
	country: string;
	symbol: string;
	digits: number;
};
export type DeliveryCountryOption = {
	code: string;
	label: string;
};

export type DeliveryCountryCode = "JP" | "KR";

export const deliveryCountries: DeliveryCountryOption[] = [
	{ code: "JP", label: "Japan" },
	{ code: "KR", label: "South Korea" },
];

const deliveryLocalization: Record<DeliveryCountryCode, { language: string; currency: string }> = {
	JP: { language: "ja", currency: "JPY" },
	KR: { language: "ko", currency: "KRW" },
};

export function isDeliveryCountryCode(country: string | undefined): country is DeliveryCountryCode {
	return deliveryCountries.some((item) => item.code === country);
}

export function resolveDeliveryCountry(
	savedCountry: string | undefined,
	detectedCountries: readonly (string | null)[],
): DeliveryCountryCode {
	const saved = savedCountry?.trim().toUpperCase();
	if (isDeliveryCountryCode(saved)) return saved;

	for (const detectedCountry of detectedCountries) {
		const detected = detectedCountry?.trim().toUpperCase();
		if (isDeliveryCountryCode(detected)) return detected;
	}

	return "JP";
}

export function getDeliveryLocalization(country: DeliveryCountryCode) {
	return deliveryLocalization[country];
}

export function regionName(code: string, language: string, fallback: string) {
	try { return new Intl.DisplayNames([language], { type: "region" }).of(code) ?? fallback; }
	catch { return fallback; }
}

export function currencyName(code: string, language: string, fallback: string) {
	try { return new Intl.DisplayNames([language], { type: "currency" }).of(code) ?? fallback; }
	catch { return fallback; }
}

export const languages: LanguageOption[] = [
	{ code: "ja", label: "日本語", country: "Japan", badge: "JP" },
	{ code: "ko", label: "한국어", country: "South Korea", badge: "KR" },
	{ code: "en", label: "English", country: "United Kingdom", badge: "EN" },
];

export function productTranslationLocale(locale: string) {
	return locale === "ja" || locale === "ko" ? locale : "en";
}

export const currencies: CurrencyOption[] = [
	{
		code: "JPY",
		label: "Japanese Yen",
		country: "Japan",
		symbol: "¥",
		digits: 0,
	},
	{
		code: "KRW",
		label: "South Korean Won",
		country: "South Korea",
		symbol: "₩",
		digits: 0,
	},
];

export const localeFilename: Record<string, string> = Object.fromEntries(
	languages.map(({ code }) => [
		code,
		code === "en" ? "en.default.json" : `${code}.json`,
	]),
);
