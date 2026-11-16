export type CountryBudgetProfile = {
	currency: string;
	locale: string;
	underMax: number;
	middleMin: number;
	middleMax: number;
	overMin: number;
	filterJPY: {
		underMax: number;
		middleMin: number;
		middleMax: number;
		overMin: number;
	};
};

const profiles: Record<string, CountryBudgetProfile> = {
	JP: {
		currency: "JPY",
		locale: "ja-JP",
		underMax: 20_000,
		middleMin: 20_000,
		middleMax: 30_000,
		overMin: 60_000,
		filterJPY: {
			underMax: 20_000,
			middleMin: 20_000,
			middleMax: 30_000,
			overMin: 60_000,
		},
	},
	KR: {
		currency: "KRW",
		locale: "ko-KR",
		underMax: 150_000,
		middleMin: 150_000,
		middleMax: 250_000,
		overMin: 500_000,
		filterJPY: {
			underMax: 18_000,
			middleMin: 18_000,
			middleMax: 30_000,
			overMin: 60_000,
		},
	},
	US: {
		currency: "USD",
		locale: "en-US",
		underMax: 150,
		middleMin: 150,
		middleMax: 250,
		overMin: 500,
		filterJPY: {
			underMax: 23_000,
			middleMin: 23_000,
			middleMax: 38_000,
			overMin: 75_000,
		},
	},
	GB: {
		currency: "GBP",
		locale: "en-GB",
		underMax: 120,
		middleMin: 120,
		middleMax: 200,
		overMin: 400,
		filterJPY: {
			underMax: 24_000,
			middleMin: 24_000,
			middleMax: 40_000,
			overMin: 80_000,
		},
	},
	AU: {
		currency: "AUD",
		locale: "en-AU",
		underMax: 250,
		middleMin: 250,
		middleMax: 400,
		overMin: 800,
		filterJPY: {
			underMax: 25_000,
			middleMin: 25_000,
			middleMax: 40_000,
			overMin: 80_000,
		},
	},
	CA: {
		currency: "CAD",
		locale: "en-CA",
		underMax: 200,
		middleMin: 200,
		middleMax: 350,
		overMin: 700,
		filterJPY: {
			underMax: 22_000,
			middleMin: 22_000,
			middleMax: 38_000,
			overMin: 76_000,
		},
	},
};

export function getCountryBudgetProfile(country: string): CountryBudgetProfile {
	return profiles[country] ?? profiles.JP;
}

export function formatCountryBudget(country: string, amount: number): string {
	const profile = getCountryBudgetProfile(country);
	return new Intl.NumberFormat(profile.locale, {
		style: "currency",
		currency: profile.currency,
		maximumFractionDigits: 0,
	}).format(amount);
}
