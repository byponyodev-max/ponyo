import type { StaticImageData } from "next/image";

export type SupplierAvailability =
	| "available"
	| "unavailable"
	| "needs_confirmation";
export type ProductImage = string | StaticImageData;

export type ProductVariant = {
	id: string;
	sku: string;
	title: string;
	options?: Record<string, string>;
	galleryImages?: { src: string; alt: string }[];
	previewOnly?: boolean;
	priceAmount: number;
	currency: string;
	compareAtAmount?: number;
	availability: SupplierAvailability;
};

export type Product = {
	id: string;
	sku: string;
	variantId?: string;
	variants?: ProductVariant[];
	slug: string;
	name: string;
	description: string;
	priceAmount: number;
	compareAtAmount?: number;
	currency: string;
	availability: SupplierAvailability;
	availabilityStatus?:
		| "Available"
		| "Limited"
		| "Coming Soon"
		| "Waitlist"
		| "Unavailable";
	categoryName: string;
	productType?: string;
	color?: string;
	tags?: string[];
	sizeTier?: string;
	supplierName: string;
	image: ProductImage;
	imageAlt: string;
	galleryImages?: { src: string; alt: string }[];
	categoryId?: string | null;
	brandId?: string | null;
	brandName?: string | null;
	publishedAt?: string;
	isNew?: boolean;
	artTone?: "peach" | "sage" | "lilac" | "yellow";
	size?: string;
	dimensions?: string;
	dispatchTime?: string;
	makerName?: string | null;
	makerSlug?: string | null;
	makerStory?: string | null;
	makerPhilosophy?: string | null;
	makerProcess?: string | null;
	makerLocation?: string | null;
	makerSpecialties?: string[];
	materials?: string | null;
	weightGrams?: number | null;
	editionCount?: number | null;
	estimatedDeliveryDate?: string | null;
	onlyAtPonyo?: boolean;
	reservationsOpen?: boolean;
	shippingCountries?: string[] | null;
	isExampleData?: boolean;
	badge?: string;
};
