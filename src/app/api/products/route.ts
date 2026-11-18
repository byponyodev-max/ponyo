import { NextResponse } from "next/server";
import { getLocalizedProducts } from "@/services/localized-products.server";

export async function GET(request: Request) {
	const locale = new URL(request.url).searchParams.get("locale") ?? undefined;
	const products = await getLocalizedProducts("", locale);
	return NextResponse.json({ data: products });
}
