"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";
import { regionName } from "@/lib/localization-options";
import { aggregateReservationsByCountry } from "@/lib/admin-reservation-report";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, type AdminBrand, type AdminCustomer, type AdminDashboard, type AdminIdentity, type AdminOrder, type AdminOrderDetail, type AdminProduct, type AdminSupplier } from "@/services/ponyo-api.client";
import { BrandProfileEditor, ProductProofEditor, ReservationSettingsEditor } from "@/components/admin/catalog-editors";
import type { AdminMakerApplication, MakerApplicationStatus } from "@/services/ponyo-api.client";

type AdminSection = "dashboard" | "orders" | "products" | "reservations" | "maker-applications" | "suppliers" | "brands" | "customers" | "fulfillment";
type OrderPage = { items: AdminOrder[]; total: number; limit: number; offset: number };
type ProductPage = { items: AdminProduct[]; total: number; limit: number; offset: number };

const navigation: Array<{ id: AdminSection; label: string; icon: string; hint: string }> = [
	{ id: "dashboard", label: "Dashboard", icon: "⌂", hint: "Marketplace overview" },
	{ id: "orders", label: "Orders", icon: "▤", hint: "Customer orders" },
	{ id: "products", label: "Products", icon: "♡", hint: "Catalog & approval" },
	{ id: "reservations", label: "Reservations", icon: "✦", hint: "Interest counts & targets" },
	{ id: "maker-applications", label: "Maker applications", icon: "✿", hint: "Review maker submissions" },
	{ id: "suppliers", label: "Suppliers", icon: "✿", hint: "Partners & access" },
	{ id: "brands", label: "Brands", icon: "✧", hint: "Curated labels" },
	{ id: "customers", label: "Customers", icon: "♙", hint: "Customer accounts" },
	{ id: "fulfillment", label: "Fulfillment", icon: "↗", hint: "Supplier routing" },
];

function messageFor(error: unknown) {
	if (error instanceof ApiNotConfiguredError) return "Admin services are not configured for this storefront.";
	if (error instanceof ApiRequestError) return error.message;
	return "We couldn’t complete that request. Please try again.";
}

function amount(value: number, currency: string, formatPrice: (amount: number, currency: string) => string) {
	return formatPrice(value / (currency === "JPY" || currency === "KRW" || currency === "IDR" ? 1 : 100), currency);
}

function date(value: string) {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

export default function AdminPortalPage() {
	const { formatPrice, language } = useLocalization();
	const [admin, setAdmin] = useState<AdminIdentity | null>(null);
	const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
	const [orders, setOrders] = useState<OrderPage>({ items: [], total: 0, limit: 50, offset: 0 });
	const [products, setProducts] = useState<ProductPage>({ items: [], total: 0, limit: 100, offset: 0 });
	const [suppliers, setSuppliers] = useState<AdminSupplier[]>([]);
	const [brands, setBrands] = useState<AdminBrand[]>([]);
	const [reservationProducts, setReservationProducts] = useState<AdminProduct[]>([]);
	const [makerApplications, setMakerApplications] = useState<AdminMakerApplication[]>([]);
	const [customers, setCustomers] = useState<AdminCustomer[]>([]);
	const [section, setSection] = useState<AdminSection>("dashboard");
	const [query, setQuery] = useState("");
	const [publishedFilter, setPublishedFilter] = useState<"all" | "published" | "pending">("all");
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [busyId, setBusyId] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [selectedOrderId, setSelectedOrderId] = useState("");
	const [orderDetail, setOrderDetail] = useState<AdminOrderDetail | null>(null);

	const loadSection = useCallback(async (target: AdminSection, search = query) => {
		setError("");
		try {
			switch (target) {
				case "dashboard":
					setDashboard(await ponyoApi.getAdminDashboard());
					break;
				case "orders":
				setOrders(await ponyoApi.listAdminOrders(search));
				break;
				case "fulfillment":
					setOrders(await ponyoApi.listAdminOrders(search, 100, { paymentStatus: "paid" }));
					setDashboard(await ponyoApi.getAdminDashboard());
					break;
				case "products":
				setProducts(await ponyoApi.listAdminProducts(search, publishedFilter === "all" ? undefined : publishedFilter === "published"));
				break;
				case "reservations":
					setReservationProducts(await ponyoApi.listAdminReservations());
					break;
				case "maker-applications":
					setMakerApplications(await ponyoApi.listAdminMakerApplications());
					break;
				case "suppliers":
				setSuppliers(await ponyoApi.listAdminSuppliers());
				break;
				case "brands":
					setBrands(await ponyoApi.listAdminBrands());
					break;
				case "customers":
				setCustomers(await ponyoApi.listAdminCustomers(search));
				break;
			}
		} catch (requestError) {
			setError(messageFor(requestError));
		}
	}, [publishedFilter, query]);

	const refreshAll = useCallback(async () => {
		setRefreshing(true);
		await loadSection(section);
		setRefreshing(false);
	}, [loadSection, section]);

	useEffect(() => {
		let active = true;
		void ponyoApi.getAdminMe().then(async (identity) => {
			if (!active) return;
			setAdmin(identity);
			const overview = await ponyoApi.getAdminDashboard();
			if (active) setDashboard(overview);
		}).catch((requestError: unknown) => {
			if (active && requestError instanceof ApiNotConfiguredError) setError(messageFor(requestError));
		}).finally(() => {
			if (active) setLoading(false);
		});
		return () => { active = false; };
	}, []);

	useEffect(() => {
		if (!admin || !selectedOrderId || section !== "orders") return;
		let active = true;
		void ponyoApi.getAdminOrder(selectedOrderId).then((row) => { if (active) setOrderDetail(row); })
			.catch((requestError: unknown) => { if (active) setError(messageFor(requestError)); });
		return () => { active = false; };
	}, [admin, section, selectedOrderId]);

	const productView = useMemo(() => publishedFilter === "pending" ? products.items.filter((product) => !product.published) : products.items, [products.items, publishedFilter]);
	const reservationCountryTotals = useMemo(() => aggregateReservationsByCountry(reservationProducts), [reservationProducts]);

	function navigateSection(target: AdminSection) {
		setSection(target);
		setQuery("");
		setSelectedOrderId("");
		setOrderDetail(null);
		setError("");
		if (target !== "dashboard") void loadSection(target, "");
	}

	async function handleLogin(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusyId("login");
		setError("");
		try {
			const identity = await ponyoApi.loginAdmin(email, password);
			setAdmin(identity);
			setPassword("");
			setNotice(`Welcome to Ponyo operations, ${identity.firstName || "Admin"}.`);
			setDashboard(await ponyoApi.getAdminDashboard());
		} catch (requestError) {
			setError(messageFor(requestError));
		} finally {
			setBusyId("");
			setLoading(false);
		}
	}

	async function logout() {
		setBusyId("logout");
		try { await ponyoApi.logoutAdmin(); } catch { /* Session may have expired already. */ }
		setAdmin(null);
		setDashboard(null);
		setOrders({ items: [], total: 0, limit: 50, offset: 0 });
		setProducts({ items: [], total: 0, limit: 100, offset: 0 });
		setSuppliers([]);
		setCustomers([]);
		setOrderDetail(null);
		setSelectedOrderId("");
		setBusyId("");
	}

	async function togglePublication(product: AdminProduct) {
		setBusyId(product.id);
		try {
			await ponyoApi.setAdminProductPublication(product.id, !product.published);
			setNotice(`${product.name} ${product.published ? "unpublished" : "published"}.`);
			await loadSection("products");
			setDashboard(await ponyoApi.getAdminDashboard());
		} catch (requestError) { setError(messageFor(requestError)); }
		finally { setBusyId(""); }
	}

	async function toggleSupplier(supplier: AdminSupplier) {
		setBusyId(supplier.id);
		try {
			await ponyoApi.setAdminSupplierActive(supplier.id, !supplier.active);
			setNotice(`${supplier.name} ${supplier.active ? "paused" : "activated"}.`);
			await loadSection("suppliers");
			setDashboard(await ponyoApi.getAdminDashboard());
		} catch (requestError) { setError(messageFor(requestError)); }
		finally { setBusyId(""); }
	}

	async function planSupplierOrders(order: AdminOrder) {
		setBusyId(order.id);
		try {
			const result = await ponyoApi.planAdminSupplierOrders(order.id);
			setNotice(result.createdPurchaseOrders.length
				? `Created ${result.createdPurchaseOrders.length} supplier purchase order${result.createdPurchaseOrders.length === 1 ? "" : "s"}.`
				: "Supplier routing is already up to date for this order.");
			await loadSection(section);
			if (selectedOrderId === order.id) setOrderDetail(await ponyoApi.getAdminOrder(order.id));
		} catch (requestError) { setError(messageFor(requestError)); }
		finally { setBusyId(""); }
	}

	async function updateMakerApplication(application: AdminMakerApplication, status: MakerApplicationStatus) {
		setBusyId(application.id);
		try {
			await ponyoApi.setAdminMakerApplicationStatus(application.id, status);
			setMakerApplications((current) => current.map((item) => item.id === application.id ? { ...item, status } : item));
			setNotice(`Application status updated for ${application.makerName}.`);
		} catch (requestError) { setError(messageFor(requestError)); }
		finally { setBusyId(""); }
	}

	if (loading) return <main className="ad-boot"><Image src="/ponyo-jellyfish.svg" alt="" width={44} height={44} /><span>Opening Ponyo control room…</span></main>;

	if (!admin) return <main className="ad-login-page">
		<div className="ad-login-glow ad-login-glow--one" /><div className="ad-login-glow ad-login-glow--two" />
		<Link className="ad-wordmark" href="/" aria-label="Ponyo home"><Image src="/ponyo-jellyfish.svg" alt="" width={42} height={42} /><span>PONYO<small>MARKETPLACE OPERATIONS</small></span></Link>
		<section className="ad-login-card"><div className="ad-login-art"><Image src="/ponyo-jellyfish.svg" alt="" width={75} height={75} /><span>✦</span><i>✧</i></div><p className="ad-eyebrow">THE PONYO CONTROL ROOM</p><h1>Good things,<br /><em>under control.</em></h1><p className="ad-login-copy">Sign in to manage Ponyo’s curated marketplace, partners and operations.</p>
			{error && <div className="ad-alert ad-alert--error" role="alert">{error}</div>}
			<form className="ad-login-form" onSubmit={handleLogin}><label>Admin email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@ponyo.com" /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your secure password" /></label><button className="ad-primary-button" type="submit" disabled={busyId === "login"}>{busyId === "login" ? "Signing in…" : "Enter admin dashboard"}<span>↗</span></button></form>
			<p className="ad-login-footnote">Admin access is provisioned by Ponyo operations. Customer and supplier accounts cannot enter.</p>
		</section><footer className="ad-login-footer">One thoughtful detail at a time <span>♡</span></footer>
	</main>;

	const metrics = dashboard?.metrics;
	const cards = [
		["TOTAL ORDERS", metrics?.totalOrders ?? 0, "Marketplace orders", "peach"],
		["PAID ORDERS", metrics?.paidOrders ?? 0, "Payment received", "mint"],
		["ACTIVE SUPPLIERS", metrics?.activeSuppliers ?? 0, "Marketplace partners", "lilac"],
		["LIVE PRODUCTS", metrics?.activeProducts ?? 0, `${metrics?.unpublishedProducts ?? 0} unpublished`, "blue"],
		["FULFILLMENT QUEUE", metrics?.ordersAwaitingFulfillment ?? 0, "Paid orders to follow up", "peach"],
		["LOW AVAILABILITY", metrics?.lowAvailabilityVariants ?? 0, "Variants at 3 units or less", "mint"],
	] as const;

	return <main className="ad-layout">
		<aside className="ad-sidebar"><Link className="ad-brand" href="/" aria-label="Ponyo home"><Image src="/ponyo-jellyfish.svg" alt="" width={38} height={38} /><span>PONYO<small>ADMIN STUDIO</small></span></Link><div className="ad-sidebar-rule" /><p className="ad-sidebar-label">MARKETPLACE</p>
			<nav className="ad-nav">{navigation.map((item) => <button key={item.id} className={`ad-nav-item ${section === item.id ? "is-active" : ""}`} type="button" onClick={() => navigateSection(item.id)}><span>{item.icon}</span><span className="ad-nav-copy"><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</nav>
				<nav className="ad-mobile-nav" aria-label="Admin workspace">{navigation.map((item) => <button key={item.id} className={section === item.id ? "is-active" : ""} type="button" onClick={() => navigateSection(item.id)}>{item.label}</button>)}</nav>
			<div className="ad-sidebar-note"><span>✦</span><strong>Thoughtfully found.<br />Ready to be loved.</strong><small>The little details make the whole marketplace.</small></div>
			<div className="ad-account"><span className="ad-avatar">{admin.firstName.slice(0, 1).toUpperCase() || "A"}</span><div><strong>{admin.firstName} {admin.lastName}</strong><small>{admin.email}</small></div><button type="button" onClick={() => void logout()} disabled={busyId === "logout"} aria-label="Sign out">↗</button></div>
		</aside>
		<section className="ad-main"><header className="ad-topbar"><div><span className="ad-eyebrow">PONYO MARKETPLACE MANAGEMENT</span><h1>{section === "dashboard" ? `Good morning, ${admin.firstName || "Admin"}` : navigation.find((item) => item.id === section)?.label}<span> ✦</span></h1><p>{navigation.find((item) => item.id === section)?.hint} · One calm view of the moving parts.</p></div><button className="ad-refresh" type="button" onClick={() => void refreshAll()} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button></header>
			{notice && <div className="ad-alert ad-alert--success" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}{error && <div className="ad-alert ad-alert--error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss">×</button></div>}
			{section === "dashboard" && <>
				<div className="ad-metrics">{cards.map(([label, value, note, tone]) => <article className={`ad-metric ad-metric--${tone}`} key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div>
				<div className="ad-dashboard-grid"><section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">RECENT ACTIVITY</span><h2>Latest orders</h2></div><button type="button" onClick={() => navigateSection("orders")}>View all ↗</button></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>STATUS</th><th>TOTAL</th></tr></thead><tbody>{dashboard?.recentOrders.map((order) => <tr key={order.id} onClick={() => { setSelectedOrderId(order.id); setOrderDetail(null); navigateSection("orders"); }}><td><strong>{order.orderNumber}</strong><small>{date(order.createdAt)}</small></td><td>{order.customerEmail}</td><td><span className={`ad-status ad-status--${order.status}`}>{order.status.replaceAll("_", " ")}</span></td><td>{amount(order.totalAmount, order.currency, formatPrice)}</td></tr>)}</tbody></table>{!dashboard?.recentOrders.length && <div className="ad-empty">No orders yet.</div>}</div></section>
					<section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">PONYО PARTNERS</span><h2>Supplier pulse</h2></div><button type="button" onClick={() => setSection("suppliers")}>Suppliers ↗</button></div><div className="ad-supplier-list">{dashboard?.suppliers.map((supplier) => <div className="ad-supplier-row" key={supplier.id}><span className="ad-supplier-mark">✿</span><span><strong>{supplier.name}</strong><small>{supplier.code} · {supplier.accountCount} accounts</small></span><i className={supplier.active ? "is-live" : ""}>{supplier.active ? "Active" : "Paused"}</i></div>)}</div><div className="ad-revenue-block"><small>CAPTURED LESS REFUNDS · BY CURRENCY</small>{dashboard?.revenueByCurrency.length ? dashboard.revenueByCurrency.map((row) => <strong key={row.currency}>{amount(row.amount, row.currency, formatPrice)}</strong>) : <strong>No captured revenue yet</strong>}<span>Currency totals stay separate; no implicit FX conversion.</span></div></section>
				</div>
				<section className="ad-panel ad-pending-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">CURATED BY PONYO</span><h2>Unpublished catalog</h2></div><button type="button" onClick={() => navigateSection("products")}>Open catalog ↗</button></div><div className="ad-pending-list">{dashboard?.unpublishedProducts.map((product) => <article key={product.id}><Image src={product.image} alt="" width={54} height={54} /><span><strong>{product.name}</strong><small>{product.sku} · {product.variantCount} variants</small></span><button type="button" disabled={busyId === product.id} onClick={() => void togglePublication(product)}>{busyId === product.id ? "Saving…" : "Publish listing"}</button></article>)}{!dashboard?.unpublishedProducts.length && <div className="ad-empty">No unpublished products in the catalog.</div>}</div></section>
			</>}
			{section === "orders" && <><div className="ad-toolbar"><label className="ad-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSection("orders", query); }} placeholder="Order number or customer email" /></label><button type="button" onClick={() => void loadSection("orders")}>Search orders</button><span>{orders.total} orders</span></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PAYMENT</th><th>FULFILLMENT</th><th>SUPPLIER</th><th>TOTAL</th></tr></thead><tbody>{orders.items.map((order) => <tr key={order.id} className={selectedOrderId === order.id ? "is-selected" : ""} onClick={() => { setSelectedOrderId(order.id); setOrderDetail(null); }}><td><strong>{order.orderNumber}</strong><small>{date(order.createdAt)}</small></td><td>{order.customerEmail}</td><td><span className="ad-status">{order.paymentStatus}</span></td><td>{order.fulfillmentStatus.replaceAll("_", " ")}</td><td>{order.supplierFulfillmentStatus.replaceAll("_", " ")}</td><td>{amount(order.totalAmount, order.currency, formatPrice)}</td></tr>)}</tbody></table></div></section>{orderDetail && <section className="ad-panel ad-order-detail"><div className="ad-panel-heading"><div><span className="ad-eyebrow">ORDER DETAIL · {orderDetail.paymentStatus}</span><h2>{orderDetail.orderNumber}</h2><p>{orderDetail.customerEmail} · {orderDetail.fulfillmentStatus.replaceAll("_", " ")}</p></div><button type="button" onClick={() => { setOrderDetail(null); setSelectedOrderId(""); }}>Close</button></div><div className="ad-order-facts"><span>Subtotal <strong>{amount(orderDetail.subtotalAmount, orderDetail.currency, formatPrice)}</strong></span><span>Discount <strong>{amount(orderDetail.discountAmount, orderDetail.currency, formatPrice)}</strong></span><span>Shipping <strong>{amount(orderDetail.shippingAmount, orderDetail.currency, formatPrice)}</strong></span><span>Captured <strong>{amount(orderDetail.capturedAmount, orderDetail.currency, formatPrice)}</strong></span><span>Refunded <strong>{amount(orderDetail.refundedAmount, orderDetail.currency, formatPrice)}</strong></span><span>Total <strong>{amount(orderDetail.totalAmount, orderDetail.currency, formatPrice)}</strong></span></div><div className="ad-detail-columns"><section><h3>Customer order lines</h3>{orderDetail.items.map((line) => <article key={line.id}><span><strong>{line.name}</strong><small>Qty {line.quantity} · {line.supplierOfferId ? "Supplier linked" : "Legacy / not routed"}</small></span><b>{amount(line.unitPrice * line.quantity, line.currency, formatPrice)}</b></article>)}</section><section><h3>Supplier purchase orders</h3>{orderDetail.supplierFulfillments.map((po) => <article key={po.purchaseOrderId}><span><strong>{po.purchaseOrderNumber} · {po.supplier}</strong><small>{po.status.replaceAll("_", " ")} {po.supplierOrderId ? `· Ref ${po.supplierOrderId}` : ""}</small></span><small>{po.items.length} lines</small></article>)}{orderDetail.paymentStatus === "paid" && <button className="ad-row-action" type="button" disabled={busyId === orderDetail.id} onClick={() => { const row = orders.items.find((item) => item.id === orderDetail.id); if (row) void planSupplierOrders(row); }}>{busyId === orderDetail.id ? "Planning…" : "Plan / refresh supplier routing"}</button>}</section><section><h3>Shipments</h3>{orderDetail.shipments.map((shipment) => <article key={shipment.id}><span><strong>{shipment.number} · {shipment.carrier}</strong><small>{shipment.status.replaceAll("_", " ")} · {shipment.trackingNumber}</small></span>{shipment.trackingUrl && <a href={shipment.trackingUrl} target="_blank" rel="noreferrer">Track ↗</a>}</article>)}{!orderDetail.shipments.length && <p className="ad-detail-empty">No shipment records yet.</p>}</section></div></section>}</>}
			{section === "products" && <><div className="ad-toolbar"><label className="ad-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSection("products", query); }} placeholder="Product name, SKU or slug" /></label><select value={publishedFilter} onChange={(event) => { setPublishedFilter(event.target.value as typeof publishedFilter); }}><option value="all">All products</option><option value="pending">Unpublished</option><option value="published">Published</option></select><button type="button" onClick={() => void loadSection("products")}>Search catalog</button><span>{products.total} products</span></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>PRODUCT</th><th>BRAND / CATEGORY</th><th>VARIANTS</th><th>STOCK</th><th>PRICE</th><th>STATUS</th><th>ACTION &amp; PROOF</th></tr></thead><tbody>{productView.map((product) => <tr key={product.id}><td><div className="ad-product-cell"><Image src={product.image} alt="" width={48} height={48} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td>{product.brandName}<small>{product.categoryName}</small></td><td>{product.variantCount}</td><td>{product.stockQuantity}</td><td>{amount(product.priceAmount, product.currency, formatPrice)}</td><td><span className={`ad-status ${product.published ? "ad-status--published" : "ad-status--pending"}`}>{product.published ? "Published" : "Unpublished"}</span></td><td><button className="ad-row-action" type="button" disabled={busyId === product.id} onClick={() => void togglePublication(product)}>{product.published ? "Unpublish" : "Publish"}</button><ProductProofEditor product={product} /></td></tr>)}</tbody></table></div></section></>}
			{section === "reservations" && <section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">NO-PAYMENT INTEREST</span><h2>Reservation counter</h2><p>Counts come from submitted reservations; no checkout or payment is involved.</p></div><span className="ad-count-pill">{reservationProducts.reduce((total, product) => total + (product.reservationCount ?? 0), 0)} reservations</span></div><div className="ad-reservation-country-summary" aria-label="Reservation totals by country across all products"><strong>Reservations by country</strong>{reservationCountryTotals.length ? <div className="ad-reservation-country-totals">{reservationCountryTotals.map((entry) => <span key={entry.country}>{regionName(entry.country, language, entry.country)}<strong>{entry.count}</strong></span>)}</div> : <p>No country totals yet.</p>}</div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>PRODUCT</th><th>RESERVED</th><th>BY COUNTRY</th><th>STATUS</th><th>SETTINGS</th></tr></thead><tbody>{reservationProducts.map((product) => <tr key={product.id}><td><div className="ad-product-cell"><Image src={product.image} alt="" width={48} height={48} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td><strong>{product.reservationCount ?? 0}</strong>{product.reservationTarget ? ` / ${product.reservationTarget}` : " · no target"}</td><td className="ad-reservation-country-list">{product.reservationsByCountry?.length ? product.reservationsByCountry.map((entry) => <span key={entry.country}>{regionName(entry.country, language, entry.country)}: <strong>{entry.count}</strong></span>) : <small>No reservations yet</small>}</td><td><span className={`ad-status ${product.reservationsOpen ? "ad-status--published" : "ad-status--pending"}`}>{product.reservationsOpen ? "Open" : "Closed"}</span></td><td><ReservationSettingsEditor product={product} /></td></tr>)}</tbody></table>{!reservationProducts.length && <div className="ad-empty">No products are available for reservation setup.</div>}</div></section>}
			{section === "maker-applications" && <section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">INDEPENDENT MAKERS</span><h2>Applications to review</h2><p>Private applicant details are visible only in this admin workspace.</p></div><span className="ad-count-pill">{makerApplications.length} applications</span></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>MAKER</th><th>CONTACT</th><th>PRODUCT</th><th>APPLICATION DETAILS</th><th>STATUS</th></tr></thead><tbody>{makerApplications.map((application) => <tr key={application.id}><td><strong>{application.makerName}</strong><small>{application.country} · {application.city}</small><small>{date(application.createdAt)}</small></td><td><strong>{application.contactPerson}</strong><a href={`mailto:${application.email}`}>{application.email}</a>{application.website && <a href={application.website} target="_blank" rel="noreferrer noopener">Website ↗</a>}{application.socialMedia && <a href={application.socialMedia} target="_blank" rel="noreferrer noopener">Social ↗</a>}</td><td><a href={application.productUrl} target="_blank" rel="noreferrer noopener">{application.productUrl} ↗</a><small>{application.priceRange}</small></td><td><details className="ad-application-details"><summary>Materials, evidence &amp; photos</summary><p>{application.productDescription}</p><p><strong>Demand evidence:</strong> {application.provenDesireEvidence}</p><p><strong>Materials:</strong> {application.materials}</p><p><strong>Ponyo exclusivity:</strong> {application.ponyoExclusivity}</p><div className="maker-photo-preview">{application.productPhotos.map((photo, index) => <span key={index}><Image src={photo} alt={`${application.makerName} product example ${index + 1}`} width={100} height={100} unoptimized /></span>)}</div></details></td><td><select aria-label={`Application status for ${application.makerName}`} value={application.status} disabled={busyId === application.id} onChange={(event) => void updateMakerApplication(application, event.target.value as MakerApplicationStatus)}><option value="pending">Pending</option><option value="reviewing">Reviewing</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></td></tr>)}</tbody></table>{!makerApplications.length && <div className="ad-empty">No maker applications have been submitted.</div>}</div></section>}
			{section === "suppliers" && <section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">PARTNER DIRECTORY</span><h2>Supplier relationships</h2></div><span className="ad-count-pill">{suppliers.length} suppliers</span></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>SUPPLIER</th><th>CODE</th><th>ACCOUNTS</th><th>APPROVED OFFERS</th><th>TYPE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong><small>{supplier.contactEmail ?? "No contact email"}</small></td><td>{supplier.code}</td><td>{supplier.accountCount}</td><td>{supplier.offerCount}</td><td>{supplier.isDemo ? "Demo" : "Partner"}</td><td><span className={`ad-status ${supplier.active ? "ad-status--published" : "ad-status--pending"}`}>{supplier.active ? "Active" : "Paused"}</span></td><td><button className="ad-row-action" type="button" disabled={busyId === supplier.id} onClick={() => void toggleSupplier(supplier)}>{supplier.active ? "Pause" : "Activate"}</button></td></tr>)}</tbody></table></div></section>}
			{section === "customers" && <><div className="ad-toolbar"><label className="ad-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSection("customers", query); }} placeholder="Customer name or email" /></label><button type="button" onClick={() => void loadSection("customers")}>Search customers</button></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>CUSTOMER</th><th>EMAIL</th><th>VERIFICATION</th><th>JOINED</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.firstName} {customer.lastName}</strong></td><td>{customer.email}</td><td><span className={`ad-status ${customer.emailVerified ? "ad-status--published" : "ad-status--pending"}`}>{customer.emailVerified ? "Verified" : "Pending"}</span></td><td>{date(customer.createdAt)}</td></tr>)}</tbody></table></div></section></>}
			{section === "fulfillment" && <><div className="ad-fulfillment-summary"><strong>{metrics?.ordersAwaitingFulfillment ?? 0}</strong><span>paid orders awaiting fulfillment action</span><p>Customer orders may split across suppliers. Select an order to inspect supplier confirmations and shipment tracking.</p></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>FULFILLMENT</th><th>SUPPLIER ROUTING</th><th>TOTAL</th><th>ACTION</th></tr></thead><tbody>{orders.items.map((order) => <tr key={order.id} className={selectedOrderId === order.id ? "is-selected" : ""} onClick={() => { setSelectedOrderId(order.id); setOrderDetail(null); }}><td><strong>{order.orderNumber}</strong><small>{date(order.createdAt)}</small></td><td>{order.customerEmail}</td><td>{order.fulfillmentStatus.replaceAll("_", " ")}</td><td>{order.supplierFulfillmentStatus.replaceAll("_", " ")}</td><td>{amount(order.totalAmount, order.currency, formatPrice)}</td><td><button className="ad-row-action" type="button" disabled={busyId === order.id || order.paymentStatus !== "paid"} onClick={(event) => { event.stopPropagation(); void planSupplierOrders(order); }}>{busyId === order.id ? "Planning…" : "Plan suppliers"}</button></td></tr>)}</tbody></table>{!orders.items.length && <div className="ad-empty">No paid orders need fulfillment right now.</div>}</div></section>{orderDetail && <section className="ad-panel ad-order-detail"><div className="ad-panel-heading"><div><span className="ad-eyebrow">ORDER DETAIL</span><h2>{orderDetail.orderNumber}</h2></div><button type="button" onClick={() => setOrderDetail(null)}>Close</button></div><div className="ad-detail-columns"><section><h3>Supplier purchase orders</h3>{orderDetail.supplierFulfillments.map((po) => <article key={po.purchaseOrderId}><span><strong>{po.purchaseOrderNumber} · {po.supplier}</strong><small>{po.status.replaceAll("_", " ")}</small></span><small>{po.items.length} lines</small></article>)}{!orderDetail.supplierFulfillments.length && <p className="ad-detail-empty">No supplier PO has been planned yet.</p>}</section><section><h3>Shipments &amp; tracking</h3>{orderDetail.shipments.map((shipment) => <article key={shipment.id}><span><strong>{shipment.number} · {shipment.carrier}</strong><small>{shipment.status.replaceAll("_", " ")} · {shipment.trackingNumber}</small></span>{shipment.trackingUrl && <a href={shipment.trackingUrl} target="_blank" rel="noreferrer">Track ↗</a>}</article>)}{!orderDetail.shipments.length && <p className="ad-detail-empty">No shipment records yet.</p>}</section></div></section>}</>}
			{section === "brands" && <section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">CURATED PARTNERS</span><h2>Maker profile studio</h2></div><span className="ad-count-pill">{brands.length} profiles</span></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>MAKER</th><th>SLUG</th><th>CATALOG PRODUCTS</th><th>RECORD TYPE</th><th>PROFILE</th></tr></thead><tbody>{brands.map((brand) => <tr key={brand.id}><td><strong>{brand.name}</strong></td><td>{brand.slug}</td><td>{brand.productCount}</td><td>{brand.isDemo ? "Demo seed" : "Curated catalog"}</td><td>{brand.isDemo ? <small>Demo records are not shown as maker profiles.</small> : <BrandProfileEditor brand={brand} />}</td></tr>)}</tbody></table>{!brands.length && <div className="ad-empty">No maker profiles exist yet.</div>}</div><p className="ad-brand-note">Publish only maker stories, images, materials, and process details confirmed by the maker.</p></section>}
			<footer className="ad-footer">A softer marketplace, run with care <span>♡</span><Link href="/pages/contact">Need a hand? Contact Ponyo</Link></footer>
		</section>
	</main>;
}
