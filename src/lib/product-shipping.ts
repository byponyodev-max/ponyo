import type { Product } from "@/types/product";

export type ProductShippingStatus = "deliverable" | "unavailable" | "unconfirmed";

export function getProductShippingStatus(product: Product, country: string): ProductShippingStatus {
	return getShippingStatus(product.shippingCountries, country);
}

export function getShippingStatus(shippingCountries: string[] | null | undefined, country: string): ProductShippingStatus {
	if (shippingCountries == null) return "unconfirmed";
	return shippingCountries.includes(country) ? "deliverable" : "unavailable";
}

export function sortProductsByDelivery(products: Product[], country: string): Product[] {
	return products
		.map((product, index) => ({ product, index }))
		.sort((a, b) => {
			const aRank = getProductShippingStatus(a.product, country) === "deliverable" ? 0 : 1;
			const bRank = getProductShippingStatus(b.product, country) === "deliverable" ? 0 : 1;
			return aRank - bRank || a.index - b.index;
		})
		.map(({ product }) => product);
}
