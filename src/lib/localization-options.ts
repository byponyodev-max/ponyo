export type LanguageOption = {
	code: string;
	label: string;
	country: string;
	flag: string;
};
export type CurrencyOption = {
	code: string;
	label: string;
	country: string;
	flag: string;
	symbol: string;
	digits: number;
};
export type DeliveryCountryOption = {
	code: string;
	label: string;
	flag: string;
};

export const deliveryCountries: DeliveryCountryOption[] = [
	{ code: "JP", label: "Japan", flag: "🇯🇵" },
	{ code: "KR", label: "South Korea", flag: "🇰🇷" },
	{ code: "US", label: "United States", flag: "🇺🇸" },
	{ code: "GB", label: "United Kingdom", flag: "🇬🇧" },
	{ code: "AU", label: "Australia", flag: "🇦🇺" },
	{ code: "CA", label: "Canada", flag: "🇨🇦" },
];

export function regionName(code: string, language: string, fallback: string) {
	try { return new Intl.DisplayNames([language], { type: "region" }).of(code) ?? fallback; }
	catch { return fallback; }
}

export function currencyName(code: string, language: string, fallback: string) {
	try { return new Intl.DisplayNames([language], { type: "currency" }).of(code) ?? fallback; }
	catch { return fallback; }
}

export const languages: LanguageOption[] = [
	{ code: "ja", label: "日本語", country: "Japan", flag: "🇯🇵" },
	{ code: "ko", label: "한국어", country: "South Korea", flag: "🇰🇷" },
	{ code: "en", label: "English", country: "United Kingdom", flag: "🇬🇧" },
];

export const currencies: CurrencyOption[] = [
	{
		code: "JPY",
		label: "Japanese Yen",
		country: "Japan",
		flag: "🇯🇵",
		symbol: "¥",
		digits: 0,
	},
	{
		code: "KRW",
		label: "South Korean Won",
		country: "South Korea",
		flag: "🇰🇷",
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
