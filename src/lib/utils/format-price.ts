export function formatPrice(amount: number, currency = "IDR") {
	const locale = currency === "JPY" ? "ja-JP" : currency === "KRW" ? "ko-KR" : "id-ID";
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(amount);
}
