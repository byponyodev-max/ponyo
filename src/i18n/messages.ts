import { readFile } from "node:fs/promises";
import { join } from "node:path";
import "server-only";
import { accountTranslations } from "@/locales/account-translations";
import { appTranslations } from "@/locales/app-translations";
import { authTranslations } from "@/locales/auth-translations";
import { checkoutTranslations } from "@/locales/checkout-translations";
import { contactTranslations } from "@/locales/contact-translations";
import { orderTranslations } from "@/locales/order-translations";
import { storefrontTranslations } from "@/locales/storefront-translations";
import { wishlistTranslations } from "@/locales/wishlist-translations";
import { localeFilename } from "@/lib/localization-options";

interface MessageTree {
	[key: string]: string | MessageTree;
}
type LocaleDictionary = Record<string, Record<string, string>>;

const supplementalTranslations: LocaleDictionary[] = [
	appTranslations,
	storefrontTranslations,
	checkoutTranslations,
	wishlistTranslations,
	contactTranslations,
	orderTranslations,
	accountTranslations,
	authTranslations,
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePlaceholders(value: string) {
	return value.replace(/\{\{\s*(\w+)\s*\}\}/g, "{$1}");
}

function childMessages(messages: MessageTree, key: string): MessageTree {
	const current = messages[key];
	if (typeof current === "object") return current;
	const nested: MessageTree = {};
	messages[key] = nested;
	return nested;
}

function assignMessage(messages: MessageTree, key: string, value: string) {
	const parts = key.split(".");
	const finalKey = parts.pop();
	if (!finalKey) return;
	let parent = messages;
	for (const part of parts) parent = childMessages(parent, part);
	parent[finalKey] = normalizePlaceholders(value);
}

function mergeNestedMessages(target: MessageTree, source: unknown) {
	if (!isRecord(source)) return;
	for (const [key, value] of Object.entries(source)) {
		if (typeof value === "string") {
			assignMessage(target, key, value);
		} else if (isRecord(value)) {
			mergeNestedMessages(childMessages(target, key), value);
		}
	}
}

export async function getMessages(locale: string): Promise<MessageTree> {
	const messages: MessageTree = {};
	const filename = localeFilename[locale] ?? localeFilename.en;
	const source = await readFile(join(process.cwd(), "src/locales", filename), "utf8");
	const json = source.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
	mergeNestedMessages(messages, JSON.parse(json) as unknown);
	for (const translations of supplementalTranslations) {
		const localeTranslations = translations[locale];
		if (!localeTranslations) continue;
		for (const [key, value] of Object.entries(localeTranslations)) {
			assignMessage(messages, key, value);
		}
	}
	return messages;
}
