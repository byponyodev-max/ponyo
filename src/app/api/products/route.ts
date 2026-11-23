import { NextResponse } from "next/server";
import { getLocalizedProducts } from "@/services/localized-products.server";

export async function GET(request: Request) {
	const params = new URL(request.url).searchParams;
	const locale = params.get("locale") ?? undefined;
	const query = params.get("q")?.trim() ?? "";
	const productQuery = new URLSearchParams({
		limit: params.get("limit") ?? "100",
		...(query ? { q: query } : {}),
	}).toString();
	const products = await getLocalizedProducts(productQuery, locale);
	const normalizedQuery = query.toLowerCase();
	const matchingProducts = normalizedQuery
		? products.filter((product) => `${product.name} ${product.description} ${product.productType ?? ""} ${product.categoryName} ${(product.tags ?? []).join(" ")}`.toLowerCase().includes(normalizedQuery))
		: products;
	return NextResponse.json({ data: matchingProducts });
}
