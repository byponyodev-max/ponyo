export type CurrencyBudgetProfile = {
	currency: string;
	locale: string;
	underMax: number;
	middleMin: number;
	middleMax: number;
	overMin: number;
	catalogPriceJPY: {
		underMax: number;
		middleMin: number;
		middleMax: number;
		overMin: number;
	};
};

const profiles: Record<string, CurrencyBudgetProfile> = {
	JPY: {
		currency: "JPY",
		locale: "ja-JP",
		underMax: 20_000,
		middleMin: 20_000,
		middleMax: 30_000,
		overMin: 60_000,
		catalogPriceJPY: {
			underMax: 20_000,
			middleMin: 20_000,
			middleMax: 30_000,
			overMin: 60_000,
		},
	},
	KRW: {
		currency: "KRW",
		locale: "ko-KR",
		underMax: 150_000,
		middleMin: 150_000,
		middleMax: 250_000,
		overMin: 500_000,
		catalogPriceJPY: {
			underMax: 18_000,
			middleMin: 18_000,
			middleMax: 30_000,
			overMin: 60_000,
		},
	},
	USD: {
		currency: "USD",
		locale: "en-US",
		underMax: 150,
		middleMin: 150,
		middleMax: 250,
		overMin: 500,
		catalogPriceJPY: {
			underMax: 23_000,
			middleMin: 23_000,
			middleMax: 38_000,
			overMin: 75_000,
		},
	},
	GBP: {
		currency: "GBP",
		locale: "en-GB",
		underMax: 120,
		middleMin: 120,
		middleMax: 200,
		overMin: 400,
		catalogPriceJPY: {
			underMax: 24_000,
			middleMin: 24_000,
			middleMax: 40_000,
			overMin: 80_000,
		},
	},
	AUD: {
		currency: "AUD",
		locale: "en-AU",
		underMax: 250,
		middleMin: 250,
		middleMax: 400,
		overMin: 800,
		catalogPriceJPY: {
			underMax: 25_000,
			middleMin: 25_000,
			middleMax: 40_000,
			overMin: 80_000,
		},
	},
	CAD: {
		currency: "CAD",
		locale: "en-CA",
		underMax: 200,
		middleMin: 200,
		middleMax: 350,
		overMin: 700,
		catalogPriceJPY: {
			underMax: 22_000,
			middleMin: 22_000,
			middleMax: 38_000,
			overMin: 76_000,
		},
	},
};

export function getCurrencyBudgetProfile(currency: string): CurrencyBudgetProfile {
	return profiles[currency.trim().toUpperCase()] ?? profiles.JPY;
}

export function formatCurrencyBudget(currency: string, amount: number): string {
	const profile = getCurrencyBudgetProfile(currency);
	return new Intl.NumberFormat(profile.locale, {
		style: "currency",
		currency: profile.currency,
		maximumFractionDigits: 0,
	}).format(amount);
}
