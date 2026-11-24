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

export const worldwideCountryCodes = [
	"AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT",
	"AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
	"BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
	"BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
	"CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
	"DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK",
	"FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
	"GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
	"HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR",
	"IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
	"KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS",
	"LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
	"ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
	"MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
	"NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
	"PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
	"SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM",
	"SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF",
	"TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW",
	"TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
	"VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
];

export const supportedShippingCountries: DeliveryCountryOption[] = [
	...deliveryCountries,
	{ code: "US", label: "United States" },
	{ code: "GB", label: "United Kingdom" },
	{ code: "AU", label: "Australia" },
	{ code: "CA", label: "Canada" },
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

export function getInterestCountryOptions(language: string, shippingCountries: readonly string[] | null = null) {
	const shippedCountries = new Set(shippingCountries ?? []);
	const priority = (code: string) => {
		const index = deliveryCountries.findIndex((country) => country.code === code);
		return index === -1 ? deliveryCountries.length : index;
	};
	return worldwideCountryCodes
		.filter((code) => !shippedCountries.has(code))
		.map((code) => ({ code, label: regionName(code, language, code) }))
		.sort((a, b) => priority(a.code) - priority(b.code) || a.label.localeCompare(b.label, language));
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
