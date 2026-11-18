import "server-only";

export type AppTranslationEntry = { key: string; text: string };

export function translationApiBaseUrl() {
	const configuredApiBase = [
		process.env.PONYO_API_SERVER_BASE_URL,
		process.env.PONYO_API_BASE_URL,
		process.env.NEXT_PUBLIC_PONYO_API_BASE_URL,
	].find((candidate) => candidate?.trim() && /^https?:\/\//.test(candidate.trim()));
	return (
		configuredApiBase?.trim() ??
		(process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "")
	).replace(/\/$/, "");
}

export async function requestAppTranslations(
	locale: string,
	entries: AppTranslationEntry[],
): Promise<Record<string, string>> {
	const apiBase = translationApiBaseUrl();
	if (!apiBase || entries.length === 0) return {};

	try {
		const response = await fetch(`${apiBase}/v1/localization/translations`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ locale, entries }),
			cache: "no-store",
		});
		if (!response.ok) return {};
		const result = (await response.json()) as {
			data?: { translations?: Record<string, string> };
		};
		return result.data?.translations ?? {};
	} catch {
		return {};
	}
}
