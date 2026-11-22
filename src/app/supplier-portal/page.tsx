"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";
import {
	ApiNotConfiguredError,
	ApiRequestError,
	ponyoApi,
	type SupplierIdentity,
	type SupplierListing,
	type SupplierPurchaseOrder,
} from "@/services/ponyo-api.client";

type OrderFilter = "all" | "needs_action" | "confirmed" | "review";
type Decision = "confirmed" | "rejected";
type PortalSection = "orders" | "products";
type SupplierListingDraft = {
	onHand: string;
	costAmount: string;
	minimumOrderQuantity: string;
	leadTimeDays: string;
};

function listingDraft(listing: SupplierListing): SupplierListingDraft {
	const pending = listing.pendingChange;
	return {
		onHand: String(pending?.productionCapacity ?? listing.onHand),
		costAmount: String(pending?.costAmount ?? listing.costAmount),
		minimumOrderQuantity: String(pending?.minimumOrderQuantity ?? listing.minimumOrderQuantity),
		leadTimeDays: String(pending?.leadTimeDays ?? listing.leadTimeDays),
	};
}

function errorMessage(error: unknown) {
	if (error instanceof ApiNotConfiguredError) {
		return "Supplier services are not configured for this storefront yet.";
	}
	if (error instanceof ApiRequestError) return error.message;
	return "We couldn’t complete that request. Please try again.";
}

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Date unavailable"
		: new Intl.DateTimeFormat(undefined, {
				month: "short",
				day: "numeric",
				year: "numeric",
		  }).format(date);
}

function statusLabel(status: string) {
	return status.replaceAll("_", " ");
}

function supplierAmount(amount: number, currency: string, formatPrice: (amount: number, currency: string) => string) {
	const divisor = ["JPY", "IDR"].includes(currency.toUpperCase()) ? 1 : 100;
	return formatPrice(amount / divisor, currency);
}

function needsAction(order: SupplierPurchaseOrder) {
	return !["confirmed", "rejected"].includes(order.status) && order.attempts > 0;
}

function addressLines(address?: Record<string, string> | null) {
	if (!address) return [];
	const keys = ["firstName", "lastName", "address1", "address2", "city", "region", "postalCode", "countryCode", "phone"];
	return keys.map((key) => address[key]).filter((value) => Boolean(value && value.trim()));
}

export default function SupplierPortalPage() {
	const { formatPrice } = useLocalization();
	const [identity, setIdentity] = useState<SupplierIdentity | null>(null);
	const [orders, setOrders] = useState<SupplierPurchaseOrder[]>([]);
	const [listings, setListings] = useState<SupplierListing[]>([]);
	const [listingDrafts, setListingDrafts] = useState<Record<string, SupplierListingDraft>>({});
	const [section, setSection] = useState<PortalSection>("orders");
	const [selectedId, setSelectedId] = useState("");
	const [detail, setDetail] = useState<SupplierPurchaseOrder | null>(null);
	const [filter, setFilter] = useState<OrderFilter>("all");
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [savingOfferId, setSavingOfferId] = useState("");
	const [loginEmail, setLoginEmail] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [decision, setDecision] = useState<Decision | null>(null);
	const [supplierReference, setSupplierReference] = useState("");
	const [decisionReason, setDecisionReason] = useState("");
	const [inventoryUnavailable, setInventoryUnavailable] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	async function refreshOrders(showSpinner = true) {
		if (showSpinner) setRefreshing(true);
		try {
			const rows = await ponyoApi.listSupplierPurchaseOrders();
			setOrders(rows);
			setSelectedId((current) => current || rows[0]?.id || "");
			setError("");
		} catch (requestError) {
			setError(errorMessage(requestError));
		} finally {
			if (showSpinner) setRefreshing(false);
			setLoading(false);
		}
	}

	async function refreshListings() {
		try {
			const rows = await ponyoApi.listSupplierListings();
			setListings(rows);
			setListingDrafts(Object.fromEntries(rows.map((listing) => [listing.offerId, listingDraft(listing)])));
		} catch (requestError) {
			setError(errorMessage(requestError));
		}
	}

	async function refreshPortal() {
		setRefreshing(true);
		await Promise.all([refreshOrders(false), refreshListings()]);
		setRefreshing(false);
	}

	useEffect(() => {
		let active = true;
		void ponyoApi.getSupplierMe().then(async (profile) => {
			if (!active) return;
			setIdentity(profile);
			try {
				const [rows, approvedListings] = await Promise.all([
					ponyoApi.listSupplierPurchaseOrders(),
					ponyoApi.listSupplierListings(),
				]);
				if (active) {
					setOrders(rows);
					setSelectedId(rows[0]?.id ?? "");
					setListings(approvedListings);
					setListingDrafts(Object.fromEntries(approvedListings.map((listing) => [listing.offerId, listingDraft(listing)])));
				}
			} catch (requestError) {
				if (active) setError(errorMessage(requestError));
			}
		}).catch((requestError: unknown) => {
			if (active) {
				setIdentity(null);
				if (requestError instanceof ApiNotConfiguredError) setError(errorMessage(requestError));
			}
		}).finally(() => {
			if (active) setLoading(false);
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (!identity || !selectedId) return;
		let active = true;
		void ponyoApi.getSupplierPurchaseOrder(selectedId).then((row) => {
			if (active) setDetail(row);
		}).catch((requestError: unknown) => {
			if (active) setError(errorMessage(requestError));
		});
		return () => {
			active = false;
		};
	}, [identity, selectedId]);

	const visibleOrders = useMemo(() => {
		const normalizedSearch = search.trim().toLowerCase();
		return orders.filter((order) => {
			const matchesFilter = filter === "all"
				|| (filter === "needs_action" && needsAction(order))
				|| (filter === "confirmed" && order.status === "confirmed")
				|| (filter === "review" && ["manual_review", "unknown", "rejected"].includes(order.status));
			const matchesSearch = !normalizedSearch
				|| order.purchaseOrderNumber.toLowerCase().includes(normalizedSearch)
				|| order.orderId.toLowerCase().includes(normalizedSearch)
				|| (order.supplierOrderId ?? "").toLowerCase().includes(normalizedSearch);
			return matchesFilter && matchesSearch;
		});
	}, [filter, orders, search]);

	const activeOrder = orders.find((order) => order.id === selectedId) ?? null;
	const openCount = orders.filter(needsAction).length;
	const confirmedCount = orders.filter((order) => order.status === "confirmed").length;
	const reviewCount = orders.filter((order) => ["manual_review", "unknown"].includes(order.status)).length;

	async function handleLogin(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError("");
		try {
			const profile = await ponyoApi.loginSupplier(loginEmail, loginPassword);
			setIdentity(profile);
			setLoginPassword("");
			setNotice(`Welcome to your Ponyo workspace, ${profile.supplier.name}.`);
			await Promise.all([refreshOrders(false), refreshListings()]);
		} catch (requestError) {
			setError(errorMessage(requestError));
		} finally {
			setSubmitting(false);
			setLoading(false);
		}
	}

	async function handleLogout() {
		setSubmitting(true);
		try {
			await ponyoApi.logoutSupplier();
		} catch {
			// Clear the portal view even if the session has already expired.
		}
		setIdentity(null);
		setOrders([]);
		setListings([]);
		setListingDrafts({});
		setSelectedId("");
		setDetail(null);
		setNotice("");
		setSubmitting(false);
	}

	async function handleSaveListing(event: FormEvent<HTMLFormElement>, listing: SupplierListing) {
		event.preventDefault();
		const draft = listingDrafts[listing.offerId] ?? listingDraft(listing);
		setSavingOfferId(listing.offerId);
		setError("");
		try {
			const saved = await ponyoApi.updateSupplierListing(listing.offerId, {
				productionCapacity: Number(draft.onHand),
				costAmount: Number(draft.costAmount),
				minimumOrderQuantity: Number(draft.minimumOrderQuantity),
				leadTimeDays: Number(draft.leadTimeDays),
			});
			setListings((current) => current.map((item) => item.offerId === saved.offerId ? saved : item));
			setListingDrafts((current) => ({ ...current, [saved.offerId]: listingDraft(saved) }));
			setNotice(`Change request submitted for ${saved.productName}. Storefront terms will update only after Ponyo approval.`);
		} catch (requestError) {
			setError(errorMessage(requestError));
		} finally {
			setSavingOfferId("");
		}
	}

	function updateListingDraft(listing: SupplierListing, field: keyof SupplierListingDraft, value: string) {
		setListingDrafts((current) => ({
			...current,
			[listing.offerId]: { ...(current[listing.offerId] ?? listingDraft(listing)), [field]: value },
		}));
	}

	async function handleDecision(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!activeOrder || !decision) return;
		setSubmitting(true);
		setError("");
		const reason = decision === "rejected"
			? (inventoryUnavailable ? "inventory_unavailable" : decisionReason.trim())
			: undefined;
		try {
			await ponyoApi.decideSupplierPurchaseOrder(activeOrder.id, {
				eventId: globalThis.crypto.randomUUID(),
					decision,
					...(decision === "confirmed" ? { supplierOrderId: supplierReference.trim() } : {}),
					...(reason ? { reason } : {}),
			});
			setNotice(decision === "confirmed" ? "Purchase order confirmed." : "Purchase order response saved.");
			setDecision(null);
			setSupplierReference("");
			setDecisionReason("");
			setInventoryUnavailable(false);
			await refreshOrders(false);
			const refreshedDetail = await ponyoApi.getSupplierPurchaseOrder(activeOrder.id);
			setDetail(refreshedDetail);
		} catch (requestError) {
			setError(errorMessage(requestError));
		} finally {
			setSubmitting(false);
		}
	}

	if (loading) {
		return <main className="sp-boot"><Image src="/ponyo-jellyfish.svg" alt="" width={44} height={44} /><span>Opening your Ponyo workspace…</span></main>;
	}

	if (!identity) {
		return <main className="sp-login-page">
			<div className="sp-login-glow sp-login-glow--one" /><div className="sp-login-glow sp-login-glow--two" />
			<Link className="sp-wordmark" href="/" aria-label="Ponyo home"><Image src="/ponyo-jellyfish.svg" alt="" width={42} height={42} /><span>PONYO<small>SUPPLIER STUDIO</small></span></Link>
			<section className="sp-login-card">
				<div className="sp-login-art"><Image src="/ponyo-jellyfish.svg" alt="" width={78} height={78} /><span>✦</span><i>✧</i></div>
				<p className="sp-eyebrow">A LITTLE PONYO, BEHIND THE SCENES</p>
				<h1>Welcome back,<br /><em>maker friend.</em></h1>
				<p className="sp-login-copy">Sign in to review purchase orders and keep your Ponyo partnership moving smoothly.</p>
				{error && <div className="sp-alert sp-alert--error" role="alert">{error}</div>}
				<form className="sp-login-form" onSubmit={handleLogin}>
					<label>Email address<input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="you@yourstudio.com" /></label>
					<label>Password<input type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="Enter your password" /></label>
					<button className="sp-primary-button" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in to supplier studio"}<span aria-hidden="true">↗</span></button>
				</form>
				<p className="sp-login-footnote">Supplier accounts are invited and activated by the Ponyo team.</p>
			</section>
			<footer className="sp-login-footer">Made with care, for the makers behind the magic <span>♡</span></footer>
		</main>;
	}

	return <main className="sp-portal">
		<aside className="sp-sidebar">
			<Link className="sp-sidebar-brand" href="/" aria-label="Ponyo home"><Image src="/ponyo-jellyfish.svg" alt="" width={38} height={38} /><span>PONYO<small>SUPPLIER STUDIO</small></span></Link>
			<div className="sp-sidebar-rule" />
			<p className="sp-sidebar-label">WORKSPACE</p>
			<button className={`sp-nav-item ${section === "orders" ? "sp-nav-item--active" : ""}`} type="button" onClick={() => setSection("orders")}><span>▤</span>Purchase orders</button>
			<button className={`sp-nav-item ${section === "products" ? "sp-nav-item--active" : ""}`} type="button" onClick={() => setSection("products")}><span>♡</span>Products &amp; inventory</button>
			<nav className="sp-mobile-nav" aria-label="Supplier workspace">
				<button className={section === "orders" ? "is-active" : ""} type="button" onClick={() => setSection("orders")}>Purchase orders</button>
				<button className={section === "products" ? "is-active" : ""} type="button" onClick={() => setSection("products")}>Products &amp; inventory</button>
			</nav>
			<div className="sp-sidebar-note"><span>✦</span><strong>Good things,<br />made together.</strong><small>Thank you for being part of Ponyo.</small></div>
			<div className="sp-sidebar-account"><span className="sp-avatar">{identity.user.firstName.slice(0, 1).toUpperCase()}</span><div><strong>{identity.supplier.name}</strong><small>{identity.user.email}</small></div><button type="button" onClick={handleLogout} disabled={submitting} aria-label="Sign out">↗</button></div>
		</aside>
		<section className="sp-main">
			<header className="sp-topbar"><div><span className="sp-eyebrow">YOUR PONYO WORKSPACE</span><h1>Good morning, {identity.user.firstName || "maker"}<span> ✦</span></h1><p>Here’s the latest from your little corner of Ponyo.</p></div><button className="sp-refresh-button" type="button" onClick={() => void refreshPortal()} disabled={refreshing}>{refreshing ? "Refreshing…" : "↻ Refresh"}</button></header>
			{notice && <div className="sp-alert sp-alert--success" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}
			{error && <div className="sp-alert sp-alert--error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
			<div className="sp-stats">
				<article className="sp-stat-card sp-stat-card--peach"><span className="sp-stat-icon">▤</span><small>OPEN PURCHASE ORDERS</small><strong>{orders.length}</strong><span>Across your Ponyo orders</span></article>
				<article className="sp-stat-card sp-stat-card--mint"><span className="sp-stat-icon">◷</span><small>NEEDS YOUR RESPONSE</small><strong>{openCount}</strong><span>Ready for your review</span></article>
				<article className="sp-stat-card sp-stat-card--lilac"><span className="sp-stat-icon">♡</span><small>CONFIRMED</small><strong>{confirmedCount}</strong><span>Accepted by your studio</span></article>
				<article className="sp-stat-card sp-stat-card--blue"><span className="sp-stat-icon">✧</span><small>NEEDS ATTENTION</small><strong>{reviewCount}</strong><span>We’re keeping an eye on these</span></article>
			</div>
			{section === "products" ? <>
				<div className="sp-section-heading" id="supplier-products"><div><span className="sp-eyebrow">YOUR APPROVED PONYO LISTINGS</span><h2>Products &amp; inventory</h2></div><span className="sp-order-total">{listings.length} listings</span></div>
				<div className="sp-listing-note"><span aria-hidden="true">✦</span><p>Submit production capacity, wholesale cost, MOQ and lead-time changes for Ponyo review. Approved wholesale costs set the public retail price at 20% above wholesale; no changes reach the storefront before approval.</p></div>
				{listings.length ? <div className="sp-listing-grid">{listings.map((listing) => {
					const draft = listingDrafts[listing.offerId] ?? listingDraft(listing);
					return <article className="sp-listing-card" key={listing.offerId}>
						<div className="sp-listing-heading"><span className="sp-line-item-art">♡</span><div><span className="sp-eyebrow">{listing.isPrimary ? "PRIMARY PONYO MAKER" : listing.active ? "PONYO APPROVED" : "PAUSED LISTING"}</span><h3>{listing.productName}</h3><small>{listing.variantTitle} · Variant SKU {listing.variantSku}</small></div><span className={`sp-status ${listing.pendingChange ? "sp-status--manual_review" : listing.active ? "sp-status--confirmed" : "sp-status--manual_review"}`}>{listing.pendingChange ? "Changes pending" : listing.active ? "Live" : "Paused"}</span></div>
						<div className="sp-listing-retail"><span>Storefront retail price</span><strong>{supplierAmount(listing.retailPriceAmount, listing.currency, formatPrice)}</strong><small>{listing.isPrimary ? "After approval: wholesale cost + 20%" : "Managed by Ponyo; only the primary maker sets retail pricing."}</small></div>
						{listing.pendingChange && <p className="sp-waiting-note">Your latest changes were submitted on {formatDate(listing.pendingChange.submittedAt)} and are waiting for Ponyo approval.</p>}
						<form className="sp-listing-form" onSubmit={(event) => void handleSaveListing(event, listing)}>
							<label>Proposed production capacity<input type="number" min={listing.reserved} step="1" required value={draft.onHand} onChange={(event) => updateListingDraft(listing, "onHand", event.target.value)} /><small>{listing.reserved} units already reserved; approved capacity cannot be lower than this.</small></label>
							<label>Wholesale cost · smallest currency unit ({listing.currency})<input type="number" min="0" step="1" required value={draft.costAmount} onChange={(event) => updateListingDraft(listing, "costAmount", event.target.value)} /><small>Current: {supplierAmount(listing.costAmount, listing.currency, formatPrice)} · JPY uses whole yen; USD uses cents.</small></label>
							<div className="sp-listing-form-row"><label>MOQ<input type="number" min="1" step="1" required value={draft.minimumOrderQuantity} onChange={(event) => updateListingDraft(listing, "minimumOrderQuantity", event.target.value)} /></label><label>Dispatch lead time (days)<input type="number" min="0" step="1" required value={draft.leadTimeDays} onChange={(event) => updateListingDraft(listing, "leadTimeDays", event.target.value)} /></label></div>
							<button className="sp-primary-button" type="submit" disabled={savingOfferId === listing.offerId}>{savingOfferId === listing.offerId ? "Submitting…" : listing.pendingChange ? "Resubmit changes" : "Submit for Ponyo approval"}<span aria-hidden="true">✓</span></button>
						</form>
					</article>;
				})}</div> : <div className="sp-empty-state sp-listing-empty"><span>♡</span><strong>No approved listings yet</strong><p>Once Ponyo links an approved product to your studio, you can manage its stock and supplier terms here.</p></div>}
			</> : <>
				<div className="sp-section-heading" id="purchase-orders"><div><span className="sp-eyebrow">THE LATEST LITTLE MISSIONS</span><h2>Purchase orders</h2></div><span className="sp-order-total">{orders.length} total</span></div>
				<div className="sp-content-grid">
				<section className="sp-orders-card" aria-label="Supplier purchase orders">
					<div className="sp-order-tools"><div className="sp-filter-tabs" role="group" aria-label="Filter purchase orders">
						{([["all", "All"], ["needs_action", "To review"], ["confirmed", "Confirmed"], ["review", "Attention"]] as const).map(([key, label]) => <button key={key} type="button" className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{label}</button>)}
					</div><label className="sp-search"><span aria-hidden="true">⌕</span><input aria-label="Search purchase orders" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" /></label></div>
					<div className="sp-order-list">
						{visibleOrders.map((order) => <button type="button" key={order.id} onClick={() => { setSelectedId(order.id); setDecision(null); setError(""); }} className={`sp-order-row ${selectedId === order.id ? "is-selected" : ""}`}>
							<span className="sp-order-row-main"><strong>{order.purchaseOrderNumber}</strong><small>{formatDate(order.createdAt)} · {order.items.length} {order.items.length === 1 ? "item" : "items"}</small></span>
							<span className={`sp-status sp-status--${order.status}`}>{statusLabel(order.status)}</span>
							<span className="sp-order-row-total">{supplierAmount(order.totalCost, order.currency, formatPrice)}</span><span className="sp-row-chevron">›</span>
						</button>)}
						{visibleOrders.length === 0 && <div className="sp-empty-state"><span>✧</span><strong>{orders.length ? "No orders in this view" : "Your first order will appear here"}</strong><p>{orders.length ? "Try a different filter or search term." : "When Ponyo sends a purchase order, you’ll find it here."}</p></div>}
					</div>
				</section>
				<section className="sp-detail-card" aria-label="Purchase order details">
					{activeOrder && detail && detail.id === activeOrder.id ? <>
						<div className="sp-detail-top"><div><span className="sp-eyebrow">PURCHASE ORDER</span><h3>{activeOrder.purchaseOrderNumber}</h3></div><span className={`sp-status sp-status--${activeOrder.status}`}>{statusLabel(activeOrder.status)}</span></div>
						<div className="sp-detail-meta"><div><small>CREATED</small><strong>{formatDate(activeOrder.createdAt)}</strong></div><div><small>PO GENERATION</small><strong>Round {activeOrder.generation}</strong></div><div><small>PONYO ORDER</small><strong>{activeOrder.orderId.slice(0, 8).toUpperCase()}</strong></div></div>
						<div className="sp-detail-section"><div className="sp-detail-label"><strong>Items to prepare</strong><span>{detail.items.length} {detail.items.length === 1 ? "item" : "items"}</span></div>{detail.items.map((item) => <div className="sp-line-item" key={item.id}><span className="sp-line-item-art">♡</span><span className="sp-line-item-copy"><strong>{item.productName}</strong><small>SKU {item.supplierSku} · Qty {item.quantity}</small></span><strong>{supplierAmount(item.unitCost * item.quantity, activeOrder.currency, formatPrice)}</strong></div>)}<div className="sp-total-line"><span>PO total</span><strong>{supplierAmount(activeOrder.totalCost, activeOrder.currency, formatPrice)}</strong></div></div>
						{detail.shippingAddress && <div className="sp-address"><div><span>⌂</span><strong>Ship to</strong><small>Shared only with your assigned studio</small></div><address>{addressLines(detail.shippingAddress).map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</address></div>}
						{activeOrder.supplierOrderId && <div className="sp-reference"><small>YOUR ORDER REFERENCE</small><strong>{activeOrder.supplierOrderId}</strong></div>}
						{activeOrder.rejectionReason && <div className="sp-alert sp-alert--muted">Response note: {activeOrder.rejectionReason}</div>}
						{needsAction(activeOrder) && !decision && <div className="sp-decision-actions"><p>Ready to take this one on?</p><button className="sp-primary-button" type="button" onClick={() => setDecision("confirmed")}>Confirm purchase order <span>✓</span></button><button className="sp-secondary-button" type="button" onClick={() => setDecision("rejected")}>Unable to fulfill this order</button></div>}
						{activeOrder.attempts === 0 && activeOrder.status === "pending" && <p className="sp-waiting-note">This purchase order is waiting to be sent securely by Ponyo.</p>}
						{activeOrder.lastError && <p className="sp-waiting-note">Ponyo is checking the delivery status before asking for another response.</p>}
						{decision && <form className="sp-decision-form" onSubmit={handleDecision}><div className="sp-decision-form-heading"><strong>{decision === "confirmed" ? "Confirm this purchase order" : "Let Ponyo know"}</strong><button type="button" onClick={() => setDecision(null)} aria-label="Cancel response">×</button></div>{decision === "confirmed" ? <label>Your supplier order reference<input required maxLength={180} value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} placeholder="e.g. ST-10428" /></label> : <><label>Reason or note <span>(optional)</span><textarea maxLength={500} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Share a short note for the Ponyo team" /></label><label className="sp-check-row"><input type="checkbox" checked={inventoryUnavailable} onChange={(event) => setInventoryUnavailable(event.target.checked)} /><span>These items are currently out of stock</span></label></>}<button className={decision === "confirmed" ? "sp-primary-button" : "sp-reject-button"} type="submit" disabled={submitting}>{submitting ? "Saving response…" : decision === "confirmed" ? "Confirm order" : "Send response"}</button></form>}
						{["confirmed", "rejected"].includes(activeOrder.status) && <p className="sp-waiting-note">This purchase order has a final response. Contact Ponyo if anything needs to change.</p>}
					</> : <div className="sp-empty-detail"><Image src="/ponyo-jellyfish.svg" alt="" width={64} height={64} /><strong>Select a purchase order</strong><p>Its item and delivery details will appear here.</p></div>}
				</section>
				</div>
			</>}
			<footer className="sp-footer">A softer world, made together <span>♡</span><Link href="/pages/contact">Need a hand? Contact Ponyo</Link></footer>
		</section>
	</main>;
}
