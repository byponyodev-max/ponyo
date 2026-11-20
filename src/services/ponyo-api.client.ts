import type { Product } from "@/types/product";

export const PONYO_API_BASE_URL =
	process.env.NEXT_PUBLIC_PONYO_API_BASE_URL?.replace(/\/$/, "") ?? "";

function apiUrl(path: string) {
	// Browsers use the same-origin proxy; Node fetch needs an absolute API URL.
	let base = PONYO_API_BASE_URL;
	if (typeof window === "undefined" && base.startsWith("/")) {
		base = (
			process.env.PONYO_API_SERVER_BASE_URL ??
			(process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "")
		).replace(/\/$/, "");
		if (!base || !/^https?:\/\//.test(base)) {
			throw new Error(
				"Set PONYO_API_SERVER_BASE_URL to an absolute backend URL when using a relative public API URL.",
			);
		}
	}
	return `${base}/v1${path.startsWith("/") ? path : `/${path}`}`;
}

export class ApiNotConfiguredError extends Error {
	constructor() {
		super("Ponyo API is not configured.");
		this.name = "ApiNotConfiguredError";
	}
}

export class ApiRequestError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly requestId?: string;

	constructor(
		message: string,
		status: number,
		code?: string,
		requestId?: string,
	) {
		super(message);
		this.name = "ApiRequestError";
		this.status = status;
		this.code = code;
		this.requestId = requestId;
	}
}

export type CustomerProfile = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
};

export type SupplierIdentity = {
	user: Pick<CustomerProfile, "id" | "firstName" | "lastName" | "email">;
	supplier: { id: string; code: string; name: string };
};

export type SupplierPurchaseOrderItem = {
	id: string;
	orderItemId?: string;
	variantId?: string;
	supplierSku: string;
	productName: string;
	quantity: number;
	unitCost: number;
	routeAttempt?: number;
};

export type SupplierPurchaseOrder = {
	id: string;
	purchaseOrderNumber: string;
	orderId: string;
	supplierId: string;
	status: string;
	generation: number;
	supplierOrderId: string | null;
	currency: string;
	totalCost: number;
	attempts: number;
	lastError: string | null;
	rejectionReason: string | null;
	nextAttemptAt: string | null;
	createdAt: string;
	items: SupplierPurchaseOrderItem[];
	shippingAddress?: Record<string, string> | null;
};

export type SupplierListing = {
	offerId: string;
	productId: string;
	variantId: string;
	productName: string;
	variantTitle: string;
	variantSku: string;
	retailPriceAmount: number;
	currency: string;
	supplierSku: string;
	costAmount: number;
	minimumOrderQuantity: number;
	leadTimeDays: number;
	onHand: number;
	reserved: number;
	availableQuantity: number;
	active: boolean;
};

export type SupplierListingUpdate = {
	onHand: number;
	costAmount: number;
	minimumOrderQuantity: number;
	leadTimeDays: number;
};

export type AdminIdentity = Pick<
	CustomerProfile,
	"id" | "firstName" | "lastName" | "email"
> & { role: "admin" };

export type AdminOrder = {
	id: string;
	orderNumber: string;
	createdAt: string;
	status: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	supplierFulfillmentStatus: string;
	customerEmail: string;
	totalAmount: number;
	currency: string;
	itemsCount: number;
	shipmentCount: number;
	deliveryAddress?: Record<string, string>;
};

export type AdminOrderDetail = AdminOrder & {
	subtotalAmount: number;
	discountAmount: number;
	shippingAmount: number;
	taxAmount: number;
	capturedAmount: number;
	refundedAmount: number;
	items: Array<{
		id: string;
		name: string;
		quantity: number;
		unitPrice: number;
		currency: string;
		supplierOfferId: string | null;
		productSnapshot: Record<string, unknown>;
	}>;
	shipments: Array<{
		id: string;
		number: string;
		status: string;
		carrier: string;
		trackingNumber: string;
		trackingUrl: string | null;
		estimatedDeliveryAt: string | null;
	}>;
	supplierFulfillments: Array<{
		purchaseOrderId: string;
		purchaseOrderNumber: string;
		supplier: string;
		status: string;
		supplierOrderId: string | null;
		items: Array<{
			productName: string;
			supplierSku: string;
			quantity: number;
			unitCost: number;
		}>;
	}>;
};

export type AdminProduct = {
	id: string;
	sku: string;
	slug: string;
	name: string;
	description: string;
	priceAmount: number;
	currency: string;
	categoryName: string;
	brandName: string;
	published: boolean;
	createdAt: string;
	image: string;
	variantCount: number;
	stockQuantity: number;
	availability: string;
	materials: string | null;
	weightGrams: number | null;
	editionCount: number | null;
	estimatedDeliveryDate: string | null;
	onlyAtPonyo: boolean;
	reservationsOpen: boolean;
	reservationTarget: number | null;
	shippingCountries?: string[] | null;
	reservationMinimumReachedAt?: string | null;
	reservationCount?: number;
	reservationsByCountry?: Array<{ country: string; count: number }>;
	interestCount?: number;
	interestsByCountry?: Array<{ country: string; count: number }>;
};

export type AdminReservationEntry = {
	id: string;
	productId: string;
	productName: string;
	email: string;
	country: string;
	createdAt: string;
};

export type AdminReservationPage = {
	items: AdminReservationEntry[];
	total: number;
	limit: number;
	offset: number;
};

export type AdminListPage<T> = {
	items: T[];
	total: number;
	limit: number;
	offset: number;
};

export type AdminEmailInboxStatus = {
	imapConfigured: boolean;
	smtpConfigured: boolean;
	replyConfigured: boolean;
	mailboxes: Array<{
		key: string;
		address: string;
		imapConfigured: boolean;
		smtpConfigured: boolean;
		lastSyncedAt: string | null;
		lastError: string | null;
	}>;
};

export type AdminEmailThread = {
	threadKey: string;
	subject: string;
	fromEmail: string;
	fromName: string;
	latestAt: string;
	preview: string;
	messageCount: number;
	unreadCount: number;
	source: string;
	mailboxKey: string;
	replyStatus: string;
	deliveryStatus: string;
};

export type AdminEmailInboxSummary = {
	total: number;
	unread: number;
	needsReply: number;
	replied: number;
	pending: number;
	failed: number;
	byMailbox: Record<string, {
		total: number;
		unread: number;
		needsReply: number;
		replied: number;
		pending: number;
		failed: number;
	}>;
};

export type AdminAnalytics = {
	period: { range: "7d" | "30d" | "90d" | "all"; bucket: "day" | "month"; from: string | null; to: string };
	summary: {
		orders: number;
		paidOrders: number;
		reservations: number;
		interests: number;
		newCustomers: number;
		revenueByCurrency: Array<{ currency: string; capturedAmount: number; refundedAmount: number; netAmount: number }>;
	};
	series: Array<{
		period: string;
		orders: number;
		paidOrders: number;
		reservations: number;
		interests: number;
		newCustomers: number;
	}>;
	revenueSeries: Array<{
		period: string;
		currency: string;
		capturedAmount: number;
		refundedAmount: number;
		netAmount: number;
	}>;
	topProducts: Array<{
		productId: string;
		name: string;
		unitsSold: number;
		salesByCurrency: Array<{ currency: string; amount: number }>;
	}>;
	makerPerformance: Array<{
		makerId: string;
		name: string;
		productCount: number;
		unitsSold: number;
		salesByCurrency: Array<{ currency: string; amount: number }>;
	}>;
	countrySales: Array<{
		country: string;
		orders: number;
		paidOrders: number;
		revenueByCurrency: Array<{
			currency: string;
			capturedAmount: number;
			refundedAmount: number;
			netAmount: number;
		}>;
	}>;
	reservationsByCountry: Array<{ country: string; count: number }>;
	interestsByCountry: Array<{ country: string; count: number }>;
};

export type AdminEmailMessage = {
	id: string;
	direction: "inbound" | "outbound";
	fromEmail: string;
	fromName: string;
	toEmail: string;
	subject: string;
	body: string;
	receivedAt: string;
	deliveryStatus: string;
	source: string;
};

export type AdminEmailThreadDetail = {
	threadKey: string;
	subject: string;
	replyConfigured: boolean;
	replyFrom: string | null;
	messages: AdminEmailMessage[];
};

export type MakerProfile = {
	id: string;
	slug: string;
	name: string;
	profileImageUrl: string | null;
	story: string | null;
	philosophy: string | null;
	process: string | null;
	location: string | null;
	specialties: string[];
	website: string | null;
	socialMedia: string | null;
};

export type MakerApplicationInput = {
	makerName: string;
	contactPerson: string;
	email: string;
	country: string;
	city: string;
	website: string | null;
	socialMedia: string | null;
	productUrl: string;
	productDescription: string;
	provenDesireEvidence: string;
	materials: string;
	priceRange: string;
	productPhotos: string[];
	ponyoExclusivity: string;
};

export type MakerApplicationStatus = "pending" | "reviewing" | "accepted" | "declined";

export type AdminMakerApplication = MakerApplicationInput & {
	id: string;
	status: MakerApplicationStatus;
	createdAt: string;
};

export type AdminBrandProfile = {
	profileImageUrl: string | null;
	makerStory: string | null;
	philosophy: string | null;
	process: string | null;
	location: string | null;
	specialties: string[];
	website: string | null;
	socialMedia: string | null;
};

export type AdminSupplier = {
	id: string;
	code: string;
	name: string;
	contactEmail: string | null;
	active: boolean;
	isDemo: boolean;
	accountCount: number;
	offerCount: number;
};

export type AdminBrand = {
	id: string;
	slug: string;
	name: string;
	isDemo: boolean;
	productCount: number;
} & AdminBrandProfile;

export type AdminCustomer = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	emailVerified: boolean;
	createdAt: string;
};

export type AdminAccount = Omit<AdminCustomer, "emailVerified"> & {
	emailVerified: boolean;
};

export type AdminDashboard = {
	metrics: {
		totalOrders: number;
		paidOrders: number;
		activeSuppliers: number;
		activeProducts: number;
		unpublishedProducts: number;
		ordersAwaitingFulfillment: number;
		lowAvailabilityVariants: number;
		customers: number;
		brands: number;
	};
	revenueByCurrency: Array<{ currency: string; amount: number }>;
	ordersByStatus: Array<{ status: string; count: number }>;
	recentOrders: AdminOrder[];
	unpublishedProducts: AdminProduct[];
	suppliers: Array<
		Pick<AdminSupplier, "id" | "code" | "name" | "active" | "accountCount">
	>;
	notice: string;
};

export type CustomerAddress = {
	id: string;
	firstName: string;
	lastName: string;
	address1: string;
	address2: string;
	city: string;
	region: string;
	postalCode: string;
	countryCode: string;
	phone: string;
	isDefault: boolean;
};

export type CustomerAddressInput = Omit<CustomerAddress, "id">;

export type CustomerCartInput = {
	currency: string;
	items: Array<{ variantId: string; quantity: number }>;
};

export type CartValidationInput = {
	currency: string;
	items: Array<{
		variantId: string;
		quantity: number;
		expectedPriceAmount?: number;
		expectedCurrency?: string;
	}>;
};

export type CartValidationLine = {
	variantId: string;
	productId: string | null;
	quantity: number;
	name: string;
	image: string | null;
	imageAlt: string | null;
	maker: string | null;
	slug: string | null;
	priceAmount: number | null;
	currency: string | null;
	availableQuantity: number;
	availability: "available" | "unavailable";
	issues: string[];
	priceChanged: boolean;
};

export type CartValidation = {
	items: CartValidationLine[];
	canCheckout: boolean;
	subtotalAmount: number;
	sourceCurrency: string | null;
};

export type CustomerCart = {
	id: string | null;
	currency: string;
	items: Array<{ variantId: string; quantity: number; productId?: string }>;
};

export type ProductReview = {
	id: string;
	reviewerName: string;
	rating: number;
	title: string;
	body: string;
	photos: string[];
	verifiedPurchase: boolean;
	createdAt: string;
};

export type ProductReviewSummary = {
	averageRating: number;
	reviewCount: number;
	reviews: ProductReview[];
};

export type BackendOrder = {
	id: string;
	orderNumber: string;
	createdAt: string;
	status: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	supplierFulfillmentStatus?: string;
	captureMethod?: string | null;
	capturedAmount?: number;
	refundedAmount?: number;
	customerEmail?: string;
	deliveryAddress?: string;
	trackingNumber?: string | null;
	trackingCarrier?: string | null;
	shipments?: BackendShipment[];
	subtotalAmount: number;
	discountAmount: number;
	shippingAmount: number;
	taxAmount: number;
	couponCode: string | null;
	totalAmount: number;
	currency: string;
	items: Array<{
		id: string;
		name: string;
		image: string;
		imageAlt?: string;
		maker?: string;
		quantity: number;
		unitPrice: number;
		currency: string;
		productId?: string | null;
		variantId?: string | null;
		supplierOfferId?: string | null;
		productSnapshot?: Record<string, unknown>;
		discountAmount?: number;
		subtotalAmount?: number;
		totalAmount?: number;
	}>;
};

export type BackendShipment = {
	id: string;
	shipmentNumber: string;
	status: string;
	carrier: string;
	trackingNumber: string;
	trackingUrl: string | null;
	estimatedDeliveryAt: string | null;
	shippedAt: string | null;
	deliveredAt: string | null;
	customerConfirmedAt: string | null;
	items: Array<{ orderItemId: string; quantity: number }>;
	events: Array<{
		status: string;
		source: string;
		occurredAt: string;
		note: string | null;
	}>;
};

export type PaymentTransaction = {
	id: string;
	orderId: string;
	provider: string;
	kind: string;
	status: string;
	amount: number;
	currency: string;
	providerReference: string | null;
	reason: string | null;
	errorCode: string | null;
	createdAt: string;
};

export type PaymentStatus = {
	orderId: string;
	provider: string;
	paymentStatus: string;
	orderStatus: string;
	totalAmount: number;
	currency: string;
	captureMethod: string | null;
	capturedAmount: number;
	refundedAmount: number;
	transactions: PaymentTransaction[];
};

export type OrderStatusHistoryEntry = {
	fromStatus: string | null;
	toStatus: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	source: string;
	createdAt: string;
};

export type CheckoutSessionInput = {
	idempotencyKey: string;
	email: string;
	shippingAddress: {
		firstName: string;
		lastName: string;
		address1: string;
		address2?: string;
		region?: string;
		city: string;
		postalCode: string;
		countryCode: string;
		phone?: string;
	};
	shippingMethod: string;
	paymentMethod: "card" | "paypal" | "apple_pay";
	currency?: string;
	items: Array<{
		variantId: string;
		quantity: number;
		expectedPriceAmount?: number;
		expectedCurrency?: string;
	}>;
	successUrl: string;
	cancelUrl: string;
	couponCode?: string;
	expectedTotalAmount?: number;
};

export type CheckoutQuoteInput = Omit<
	CheckoutSessionInput,
	"expectedTotalAmount" | "idempotencyKey"
>;

export type CheckoutQuote = {
	subtotalAmount: number;
	discountAmount: number;
	shippingAmount: number;
	taxAmount: number;
	totalAmount: number;
	currency: string;
	couponCode: string | null;
	taxRateBps: number;
};

export type CheckoutSession = Omit<CheckoutQuote, "taxRateBps"> & {
	taxRateBps?: number;
	checkoutUrl: string;
	orderId: string;
	expiresAt: string;
};

export type CheckoutReceipt = {
	orderId: string;
	orderNumber: string;
	status: string;
	paymentStatus: string;
	fulfillmentStatus: string;
	totalAmount: number;
	currency: string;
};

type ApiEnvelope<T> = { data: T };
let cachedCsrfToken = "";

function readCsrfCookie() {
	if (typeof document === "undefined") return "";
	const value = document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith("ponyo_csrf="));
	return value ? decodeURIComponent(value.slice("ponyo_csrf=".length)) : "";
}

async function ensureCsrfToken() {
	const cookieToken = readCsrfCookie();
	if (cookieToken) return cookieToken;
	if (cachedCsrfToken) return cachedCsrfToken;
	const response = await fetch(apiUrl("/auth/csrf"), {
		credentials: "include",
		cache: "no-store",
		referrerPolicy: "no-referrer",
		headers: { Accept: "application/json" },
	});
	if (!response.ok)
		throw new ApiRequestError(
			"Unable to initialize a secure session.",
			response.status,
		);
	const payload = (await response.json()) as { data?: { csrfToken?: string } };
	cachedCsrfToken = payload.data?.csrfToken ?? readCsrfCookie();
	if (!cachedCsrfToken)
		throw new ApiRequestError("The API did not issue a CSRF token.", 403);
	return cachedCsrfToken;
}

async function apiRequest<T>(
	path: string,
	init: RequestInit = {},
	csrf = true,
): Promise<T> {
	if (!PONYO_API_BASE_URL) throw new ApiNotConfiguredError();
	const method = (init.method ?? "GET").toUpperCase();
	const headers = new Headers(init.headers);
	headers.set("Accept", "application/json");
	if (init.body && !headers.has("Content-Type"))
		headers.set("Content-Type", "application/json");
	if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method)) {
		const token = await ensureCsrfToken();
		if (token) headers.set("X-CSRF-Token", token);
	}

	const response = await fetch(apiUrl(path), {
		...init,
		method,
		headers,
		credentials: "include",
		cache: "no-store",
		referrerPolicy: "no-referrer",
	});

	let payload:
		| ApiEnvelope<T>
		| { error?: { code?: string; message?: string; request_id?: string } }
		| undefined;
	try {
		payload = await response.json();
	} catch {
		payload = undefined;
	}
	if (!response.ok) {
		const error = payload && "error" in payload ? payload.error : undefined;
		throw new ApiRequestError(
			error?.message ?? "The Ponyo service could not complete this request.",
			response.status,
			error?.code,
			error?.request_id,
		);
	}
	return (payload as ApiEnvelope<T>).data;
}

async function apiDownload(path: string, accept = "text/csv"): Promise<Blob> {
	if (!PONYO_API_BASE_URL) throw new ApiNotConfiguredError();
	const response = await fetch(apiUrl(path), {
		credentials: "include",
		cache: "no-store",
		referrerPolicy: "no-referrer",
		headers: { Accept: accept },
	});
	if (!response.ok) {
		let message = "The Ponyo service could not complete this request.";
		try {
			const payload = (await response.json()) as {
				detail?: string;
				error?: { message?: string };
			};
			message = payload.error?.message ?? payload.detail ?? message;
		} catch {
			message = response.statusText || message;
		}
		throw new ApiRequestError(message, response.status);
	}
	return response.blob();
}

export const ponyoApi = {
	// Public, read-only POST: no authentication or CSRF bootstrap is needed.
	validateCart: (input: CartValidationInput) =>
		apiRequest<CartValidation>(
			"/cart/validate",
			{
				method: "POST",
				body: JSON.stringify(input),
			},
			false,
		),
	getCart: () => apiRequest<CustomerCart>("/cart"),
	updateCart: (input: CustomerCartInput) =>
		apiRequest<CustomerCart>("/cart", {
			method: "PUT",
			body: JSON.stringify(input),
		}),
	getLocalizationRates: (symbols = "USD,EUR,GBP,AUD,CAD,IDR") =>
		apiRequest<{ base: string; date: string; rates: Record<string, number> }>(
			`/localization/rates?symbols=${encodeURIComponent(symbols)}`,
		),
	listProducts: (query = "", locale = "en") => {
		const params = new URLSearchParams(
			query.startsWith("?") ? query.slice(1) : query,
		);
		params.set("locale", locale);
		return apiRequest<Product[]>(`/products?${params.toString()}`);
	},
	getProduct: (id: string, locale = "en") =>
		apiRequest<Product>(
			`/products/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`,
		),
	getMakerProfile: (slug: string, locale = "en") =>
		apiRequest<{ maker: MakerProfile; products: Product[] }>(
			`/makers/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`,
		),
	submitMakerApplication: (input: MakerApplicationInput) =>
		apiRequest<{ id: string; status: MakerApplicationStatus }>(
			"/makers/applications",
			{ method: "POST", body: JSON.stringify(input) },
		),
	getProductReservations: (productId: string) =>
		apiRequest<{ reservationCount: number; target: number | null; open: boolean }>(
			`/products/${encodeURIComponent(productId)}/reservations`,
		),
	submitProductReservation: (productId: string, input: { email: string; country: string }) =>
		apiRequest<{ accepted: boolean; reservationCount: number; target: number | null }>(
			`/products/${encodeURIComponent(productId)}/reservations`,
			{ method: "POST", body: JSON.stringify(input) },
		),
	submitProductInterest: (productId: string, input: { email: string; country: string }) =>
		apiRequest<{ accepted: boolean; interestCount: number; country: string }>(
			`/products/${encodeURIComponent(productId)}/interests`,
			{ method: "POST", body: JSON.stringify(input) },
		),
	getProductReviews: (productId: string) =>
		apiRequest<ProductReviewSummary>(
			`/products/${encodeURIComponent(productId)}/reviews`,
		),
	submitProductReview: (
		productId: string,
		input: { rating: number; title: string; body: string; photos?: string[] },
	) =>
		apiRequest<ProductReview>(
			`/products/${encodeURIComponent(productId)}/reviews`,
			{
				method: "POST",
				body: JSON.stringify(input),
			},
		),
	joinProductWaitlist: (
		productId: string,
		input: { email: string; firstName: string },
	) =>
		apiRequest<{ accepted: boolean }>(
			`/products/${encodeURIComponent(productId)}/waitlist`,
			{
				method: "POST",
				body: JSON.stringify(input),
			},
		),
	login: async (email: string, password: string) => {
		const response = await apiRequest<{ customer: CustomerProfile }>(
			"/auth/login",
			{
				method: "POST",
				body: JSON.stringify({ email, password }),
			},
		);
		return response.customer;
	},
	register: async (input: {
		firstName: string;
		email: string;
		password: string;
		marketingOptIn: boolean;
		lastName: string;
	}) => {
		const response = await apiRequest<{
			accepted: boolean;
			emailVerificationRequired: boolean;
		}>("/auth/register", {
			method: "POST",
			body: JSON.stringify(input),
		});
		return response;
	},
	requestPasswordReset: (email: string) =>
		apiRequest<{ accepted: boolean }>("/auth/password-reset", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	resendVerificationEmail: (email: string) =>
		apiRequest<{ accepted: boolean }>("/auth/verify-email/resend", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	verifyEmail: (token: string) =>
		apiRequest<{ accepted: boolean }>("/auth/verify-email/confirm", {
			method: "POST",
			body: JSON.stringify({ token }),
		}),
	confirmPasswordReset: (token: string, password: string) =>
		apiRequest<{ accepted: boolean }>("/auth/password-reset/confirm", {
			method: "POST",
			body: JSON.stringify({ token, password }),
		}),
	getMe: async () => {
		const response = await apiRequest<
			CustomerProfile | { customer: CustomerProfile }
		>("/auth/me");
		return "customer" in response ? response.customer : response;
	},
	updateMe: async (input: { firstName: string; lastName: string }) => {
		const response = await apiRequest<
			CustomerProfile | { customer: CustomerProfile }
		>("/auth/me", { method: "PATCH", body: JSON.stringify(input) });
		return "customer" in response ? response.customer : response;
	},
	getAddresses: () => apiRequest<CustomerAddress[]>("/auth/addresses"),
	createAddress: (input: CustomerAddressInput) =>
		apiRequest<CustomerAddress>("/auth/addresses", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	updateAddress: (id: string, input: CustomerAddressInput) =>
		apiRequest<CustomerAddress>(`/auth/addresses/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify(input),
		}),
	deleteAddress: (id: string) =>
		apiRequest<{ accepted: boolean }>(
			`/auth/addresses/${encodeURIComponent(id)}`,
			{
				method: "DELETE",
			},
		),
	getWishlist: () => apiRequest<{ productSlugs: string[] }>("/auth/wishlist"),
	updateWishlist: (productSlugs: string[]) =>
		apiRequest<{ productSlugs: string[] }>("/auth/wishlist", {
			method: "PUT",
			body: JSON.stringify({ productSlugs }),
		}),
	logout: () =>
		apiRequest<{ accepted: boolean }>("/auth/logout", { method: "POST" }),
	getOrders: async () => {
		return apiRequest<BackendOrder[]>("/orders");
	},
	getOrder: (id: string) =>
		apiRequest<BackendOrder>(`/orders/${encodeURIComponent(id)}`),
	loginSupplier: (email: string, password: string) =>
		apiRequest<SupplierIdentity>("/supplier-auth/login", {
			method: "POST",
			body: JSON.stringify({ email, password }),
		}),
	getSupplierMe: () => apiRequest<SupplierIdentity>("/supplier-auth/me"),
	logoutSupplier: async () => {
		const result = await apiRequest<{ accepted: boolean }>(
			"/supplier-auth/logout",
			{ method: "POST" },
		);
		cachedCsrfToken = "";
		return result;
	},
	listSupplierPurchaseOrders: (limit = 50, offset = 0) =>
		apiRequest<SupplierPurchaseOrder[]>(
			`/supplier-orders?limit=${limit}&offset=${offset}`,
		),
	getSupplierPurchaseOrder: (id: string) =>
		apiRequest<SupplierPurchaseOrder>(
			`/supplier-orders/${encodeURIComponent(id)}`,
		),
	decideSupplierPurchaseOrder: (
		id: string,
		input: {
			eventId: string;
			decision: "confirmed" | "rejected";
			supplierOrderId?: string;
			reason?: string;
		},
	) =>
		apiRequest<SupplierPurchaseOrder>(
			`/supplier-orders/${encodeURIComponent(id)}/confirmation`,
			{ method: "POST", body: JSON.stringify(input) },
		),
	listSupplierListings: (limit = 100) =>
		apiRequest<SupplierListing[]>(`/supplier-catalog/offers?limit=${limit}`),
	updateSupplierListing: (offerId: string, input: SupplierListingUpdate) =>
		apiRequest<SupplierListing>(
			`/supplier-catalog/offers/${encodeURIComponent(offerId)}`,
			{ method: "PATCH", body: JSON.stringify(input) },
		),
	loginAdmin: async (email: string, password: string) => {
		const response = await apiRequest<{ user: AdminIdentity }>(
			"/admin-auth/login",
			{
				method: "POST",
				body: JSON.stringify({ email, password }),
			},
		);
		return response.user;
	},
	getAdminMe: async () => {
		const response = await apiRequest<{ user: AdminIdentity }>(
			"/admin-auth/me",
		);
		return response.user;
	},
	logoutAdmin: async () => {
		const result = await apiRequest<{ accepted: boolean }>(
			"/admin-auth/logout",
			{ method: "POST" },
		);
		cachedCsrfToken = "";
		return result;
	},
	getAdminDashboard: () => apiRequest<AdminDashboard>("/admin/dashboard"),
	getAdminAnalytics: (range: AdminAnalytics["period"]["range"] = "30d") =>
		apiRequest<AdminAnalytics>(`/admin/analytics?range=${range}`),
	listAdminOrders: (
		query = "",
		limit = 50,
		filters: { paymentStatus?: string; fulfillmentStatus?: string } = {},
		offset = 0,
	) => {
		const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
		if (filters.paymentStatus)
			params.set("payment_status", filters.paymentStatus);
		if (filters.fulfillmentStatus)
			params.set("fulfillment_status", filters.fulfillmentStatus);
		return apiRequest<{
			items: AdminOrder[];
			total: number;
			limit: number;
			offset: number;
		}>(`/admin/orders?${params.toString()}`);
	},
	getAdminOrder: (id: string) =>
		apiRequest<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(id)}`),
	listAdminProducts: (query = "", published?: boolean, limit = 100, offset = 0) => {
		const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
		if (published !== undefined) params.set("published", String(published));
		return apiRequest<{
			items: AdminProduct[];
			total: number;
			limit: number;
			offset: number;
		}>(`/admin/products?${params.toString()}`);
	},
	listAdminReservations: () =>
		apiRequest<AdminProduct[]>("/admin/reservations"),
	listAdminInterests: () =>
		apiRequest<AdminProduct[]>("/admin/interests"),
	listAdminReservationEntries: (filters: {
		productId?: string;
		country?: string;
		q?: string;
		limit?: number;
		offset?: number;
	} = {}) => {
		const params = new URLSearchParams({
			limit: String(filters.limit ?? 50),
			offset: String(filters.offset ?? 0),
		});
		if (filters.productId) params.set("productId", filters.productId);
		if (filters.country) params.set("country", filters.country);
		if (filters.q) params.set("q", filters.q);
		return apiRequest<AdminReservationPage>(`/admin/reservations/entries?${params.toString()}`);
	},
	downloadAdminReservationCsv: (filters: {
		productId?: string;
		country?: string;
		q?: string;
	} = {}) => {
		const params = new URLSearchParams();
		if (filters.productId) params.set("productId", filters.productId);
		if (filters.country) params.set("country", filters.country);
		if (filters.q) params.set("q", filters.q);
		return apiDownload(`/admin/reservations/export.csv?${params.toString()}`);
	},
	downloadAdminReservationsXlsx: (filters: {
		productId?: string;
		country?: string;
		q?: string;
	} = {}) => {
		const params = new URLSearchParams();
		if (filters.productId) params.set("productId", filters.productId);
		if (filters.country) params.set("country", filters.country);
		if (filters.q) params.set("q", filters.q);
		return apiDownload(
			`/admin/reservations/export.xlsx?${params.toString()}`,
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
	},
	setAdminProductReservations: (
		id: string,
		input: { reservationsOpen: boolean; reservationTarget: number | null },
	) =>
		apiRequest<{ id: string; reservationsOpen: boolean; reservationTarget: number | null }>(
			`/admin/products/${encodeURIComponent(id)}/reservations`,
			{ method: "PATCH", body: JSON.stringify(input) },
		),
	updateAdminProductProof: (
		id: string,
		input: {
			materials: string | null;
			weightGrams: number | null;
			editionCount: number | null;
			estimatedDeliveryDate: string | null;
			onlyAtPonyo: boolean;
			shippingCountries: string[] | null;
		},
	) =>
		apiRequest<AdminProduct>(
			`/admin/products/${encodeURIComponent(id)}/proof`,
			{ method: "PATCH", body: JSON.stringify(input) },
		),
	setAdminProductPublication: (id: string, published: boolean) =>
		apiRequest<AdminProduct>(
			`/admin/products/${encodeURIComponent(id)}/publication`,
			{
				method: "PATCH",
				body: JSON.stringify({ published }),
			},
		),
	listAdminSuppliers: () => apiRequest<AdminSupplier[]>("/admin/suppliers"),
	listAdminBrands: () => apiRequest<AdminBrand[]>("/admin/brands"),
	updateAdminBrandProfile: (id: string, input: Partial<AdminBrandProfile>) =>
		apiRequest<{ id: string; slug: string; name: string }>(
			`/admin/brands/${encodeURIComponent(id)}/profile`,
			{ method: "PATCH", body: JSON.stringify(input) },
		),
	listAdminMakerApplications: () =>
		apiRequest<AdminMakerApplication[]>("/admin/maker-applications"),
	setAdminMakerApplicationStatus: (id: string, status: MakerApplicationStatus) =>
		apiRequest<{ id: string; status: MakerApplicationStatus }>(
			`/admin/maker-applications/${encodeURIComponent(id)}/status`,
			{ method: "PATCH", body: JSON.stringify({ status }) },
		),
	setAdminSupplierActive: (id: string, active: boolean) =>
		apiRequest<{
			id: string;
			code: string;
			name: string;
			active: boolean;
			isDemo: boolean;
		}>(`/admin/suppliers/${encodeURIComponent(id)}/status`, {
			method: "PATCH",
			body: JSON.stringify({ active }),
		}),
	listAdminCustomers: (query = "", limit = 10, offset = 0) => {
		const params = new URLSearchParams({ q: query, limit: String(limit), offset: String(offset) });
		return apiRequest<AdminListPage<AdminCustomer>>(`/admin/customers?${params.toString()}`);
	},
	listAdminAccounts: () =>
		apiRequest<AdminAccount[]>("/admin/admins"),
	createAdminAccount: (input: {
		firstName: string;
		lastName: string;
		email: string;
		password: string;
	}) =>
		apiRequest<AdminAccount>("/admin/admins", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	updateAdminAccount: (
		id: string,
		input: { firstName: string; lastName: string; email: string; password?: string },
	) =>
		apiRequest<AdminAccount>(`/admin/admins/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: JSON.stringify(input),
		}),
	revokeAdminAccess: (id: string) =>
		apiRequest<{ id: string; role: "customer" }>(
			`/admin/admins/${encodeURIComponent(id)}`,
			{ method: "DELETE" },
		),
	getAdminEmailInboxStatus: () =>
		apiRequest<AdminEmailInboxStatus>("/admin/email/inbox/status"),
	listAdminEmailThreads: (
		query = "",
		limit = 100,
		offset = 0,
		filters: { mailboxKey?: string; status?: string } = {},
	) => {
		const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
		if (query.trim()) params.set("q", query.trim());
		if (filters.mailboxKey) params.set("mailboxKey", filters.mailboxKey);
		if (filters.status) params.set("status", filters.status);
		return apiRequest<{ items: AdminEmailThread[]; total: number; limit: number; offset: number; summary: AdminEmailInboxSummary }>(
			`/admin/email/inbox?${params.toString()}`,
		);
	},
	getAdminEmailThread: (threadKey: string) =>
		apiRequest<AdminEmailThreadDetail>(`/admin/email/inbox/${encodeURIComponent(threadKey)}`),
	syncAdminEmailInbox: () =>
		apiRequest<{
			imapConfigured: boolean;
			importedPortalMessages: number;
			importedMailboxMessages: number;
			mailboxes: AdminEmailInboxStatus["mailboxes"];
		}>("/admin/email/inbox/sync", { method: "POST", body: JSON.stringify({}) }),
	replyAdminEmailThread: (
		threadKey: string,
		input: { body: string; idempotencyKey: string },
	) =>
		apiRequest<{
			threadKey: string;
			messageId: string;
			deliveryStatus: string;
			alreadyQueued: boolean;
		}>(`/admin/email/inbox/${encodeURIComponent(threadKey)}/reply`, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	planAdminSupplierOrders: (orderId: string) =>
		apiRequest<{
			orderId: string;
			fulfillmentStatus: string;
			createdPurchaseOrders: SupplierPurchaseOrder[];
		}>(`/supplier-orders/orders/${encodeURIComponent(orderId)}/plan`, {
			method: "POST",
			body: JSON.stringify({}),
		}),
	createAdminShipment: (
		orderId: string,
		input: {
			carrier: string;
			trackingNumber: string;
			trackingUrl?: string;
			estimatedDeliveryAt?: string;
			items: Array<{ orderItemId: string; quantity: number }>;
		},
	) =>
		apiRequest<{
			id: string;
			shipmentNumber: string;
			status: string;
			carrier: string;
			trackingNumber: string;
			trackingUrl: string | null;
		}>(`/orders/${encodeURIComponent(orderId)}/shipments`, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	updateAdminShipmentStatus: (
		orderId: string,
		shipmentId: string,
		input: {
			status:
				| "in_transit"
				| "out_for_delivery"
				| "delivered"
				| "exception"
				| "returned";
			eventId: string;
			note?: string;
		},
	) =>
		apiRequest<{ id: string; status: string }>(
			`/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipmentId)}/status`,
			{ method: "POST", body: JSON.stringify(input) },
		),
	getPaymentStatus: (id: string) =>
		apiRequest<PaymentStatus>(`/payments/orders/${encodeURIComponent(id)}`),
	syncPaymentStatus: (id: string) =>
		apiRequest<PaymentStatus>(
			`/payments/orders/${encodeURIComponent(id)}/sync`,
			{
				method: "POST",
				body: JSON.stringify({}),
			},
		),
	getOrderHistory: (id: string) =>
		apiRequest<OrderStatusHistoryEntry[]>(
			`/orders/${encodeURIComponent(id)}/history`,
		),
	confirmShipmentDelivery: (orderId: string, shipmentId: string) =>
		apiRequest<BackendShipment>(
			`/orders/${encodeURIComponent(orderId)}/shipments/${encodeURIComponent(shipmentId)}/confirm-delivery`,
			{ method: "POST", body: JSON.stringify({}) },
		),
	cancelOrder: (id: string, input: { reason?: string } = {}) =>
		apiRequest<BackendOrder>(`/orders/${encodeURIComponent(id)}/cancel`, {
			method: "POST",
			body: JSON.stringify(input),
		}),
	getCheckoutQuote: (input: CheckoutQuoteInput) =>
		apiRequest<CheckoutQuote>("/checkout/quote", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	createCheckoutSession: (input: CheckoutSessionInput) =>
		apiRequest<CheckoutSession>("/checkout/sessions", {
			method: "POST",
			body: JSON.stringify(input),
		}),
	getCheckoutReceipt: (sessionId: string) =>
		apiRequest<CheckoutReceipt>(
			`/checkout/sessions/${encodeURIComponent(sessionId)}`,
		),
	subscribeNewsletter: (email: string) =>
		apiRequest<{ accepted: boolean }>("/newsletter/subscriptions", {
			method: "POST",
			body: JSON.stringify({ email }),
		}),
	submitContactRequest: (input: {
		name: string;
		email: string;
		message: string;
		requestType?: string;
	}) =>
		apiRequest<{
			accepted: boolean;
			emailNotificationSent: boolean;
			notificationEmail: string;
		}>("/contact/requests", {
			method: "POST",
			body: JSON.stringify(input),
		}),
};
