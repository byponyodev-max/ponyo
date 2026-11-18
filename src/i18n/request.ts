import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
	getDeliveryLocalization,
	languages,
	resolveDeliveryCountry,
} from "@/lib/localization-options";
import { getMessages } from "@/i18n/messages";

export default getRequestConfig(async () => {
	const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
	const savedLanguage = cookieStore.get("ponyo-language")?.value;
	const country = resolveDeliveryCountry(cookieStore.get("ponyo-country")?.value, [
		requestHeaders.get("cf-ipcountry"),
		requestHeaders.get("x-vercel-ip-country"),
	]);
	const locale =
		languages.find((language) => language.code === savedLanguage)?.code ??
		getDeliveryLocalization(country).language;

	return {
		locale,
		messages: await getMessages(locale),
	};
});
