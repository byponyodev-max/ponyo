"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";
import { regionName } from "@/lib/localization-options";
import { aggregateReservationsByCountry } from "@/lib/admin-reservation-report";
import { ApiNotConfiguredError, ApiRequestError, ponyoApi, type AdminAccount, type AdminAnalytics, type AdminBrand, type AdminCustomer, type AdminDashboard, type AdminEmailInboxStatus, type AdminEmailInboxSummary, type AdminEmailThread, type AdminEmailThreadDetail, type AdminIdentity, type AdminOrder, type AdminOrderDetail, type AdminProduct, type AdminReservationPage, type AdminSupplier } from "@/services/ponyo-api.client";
import { BrandProfileEditor, ProductProofEditor, ReservationSettingsEditor } from "@/components/admin/catalog-editors";
import type { AdminMakerApplication, MakerApplicationStatus } from "@/services/ponyo-api.client";

type AdminSection = "dashboard" | "analytics" | "orders" | "products" | "reservations" | "email-inbox" | "maker-applications" | "suppliers" | "brands" | "customers" | "admin-accounts" | "fulfillment";
type EmailStatusFilter = "all" | "unread" | "needs_reply" | "replied" | "pending" | "failed";
type OrderPage = { items: AdminOrder[]; total: number; limit: number; offset: number };
type ProductPage = { items: AdminProduct[]; total: number; limit: number; offset: number };
type AdminAccountEditDraft = Pick<AdminAccount, "id" | "firstName" | "lastName" | "email"> & { password: string };

const navigation: Array<{ id: AdminSection; label: string; labelKey: string; icon: string; hint: string; hintKey: string }> = [
	{ id: "dashboard", label: "Dashboard", labelKey: "dashboard", icon: "⌂", hint: "Marketplace overview", hintKey: "dashboard_hint" },
	{ id: "analytics", label: "Analytics", labelKey: "analytics", icon: "◷", hint: "Orders, demand & revenue", hintKey: "analytics_hint" },
	{ id: "orders", label: "Orders", labelKey: "orders", icon: "▤", hint: "Customer orders", hintKey: "orders_hint" },
	{ id: "products", label: "Products", labelKey: "products", icon: "♡", hint: "Catalog & approval", hintKey: "products_hint" },
	{ id: "reservations", label: "Reservations & interests", labelKey: "reservations_interest", icon: "✦", hint: "Reservation targets and unshipped demand", hintKey: "reservations_hint" },
	{ id: "email-inbox", label: "Email inbox", labelKey: "email_inbox", icon: "✉", hint: "Customer messages & replies", hintKey: "email_inbox_hint" },
	{ id: "maker-applications", label: "Maker applications", labelKey: "maker_applications", icon: "✿", hint: "Review maker submissions", hintKey: "maker_applications_hint" },
	{ id: "suppliers", label: "Suppliers", labelKey: "suppliers", icon: "✿", hint: "Partners & access", hintKey: "suppliers_hint" },
	{ id: "brands", label: "Brands", labelKey: "brands", icon: "✧", hint: "Curated labels", hintKey: "brands_hint" },
	{ id: "customers", label: "Customers", labelKey: "customers", icon: "♙", hint: "Customer accounts", hintKey: "customers_hint" },
	{ id: "admin-accounts", label: "Admin accounts", labelKey: "admin_accounts", icon: "⚙", hint: "Manage operations access", hintKey: "admin_accounts_hint" },
	{ id: "fulfillment", label: "Fulfillment", labelKey: "fulfillment", icon: "↗", hint: "Supplier routing", hintKey: "fulfillment_hint" },
];

type Translate = (key: string, fallback: string, values?: Record<string, string | number>) => string;

const emailReplyTemplates = [
	{ id: "thanks-en", label: "Thank you · English", body: "Hello,\n\nThank you for reaching out to Ponyo. We appreciate your message and will be happy to help.\n\nWith care,\nThe Ponyo team" },
	{ id: "thanks-ja", label: "お礼 · 日本語", body: "こんにちは。\n\nPonyoへお問い合わせいただき、ありがとうございます。ご連絡いただけてうれしいです。\n\nPonyoチームより" },
	{ id: "thanks-ko", label: "감사 인사 · 한국어", body: "안녕하세요.\n\nPonyo에 문의해 주셔서 감사합니다. 보내주신 메시지를 확인했으며 기꺼이 도와드리겠습니다.\n\nPonyo 팀 드림" },
	{ id: "checking-en", label: "We are checking · English", body: "Hello,\n\nThank you for your message. We are checking the details and will get back to you as soon as we can.\n\nWith care,\nThe Ponyo team" },
	{ id: "checking-ja", label: "確認中 · 日本語", body: "こんにちは。\n\nお問い合わせいただき、ありがとうございます。内容を確認のうえ、できるだけ早くご連絡いたします。\n\nPonyoチームより" },
	{ id: "checking-ko", label: "확인 중 · 한국어", body: "안녕하세요.\n\n문의해 주셔서 감사합니다. 내용을 확인한 뒤 가능한 한 빠르게 답변드리겠습니다.\n\nPonyo 팀 드림" },
];

function messageFor(error: unknown, t: Translate) {
	if (error instanceof ApiNotConfiguredError) return t("admin.ui.services_unconfigured", "Admin services are not configured for this storefront.");
	if (error instanceof ApiRequestError) return error.message;
	return t("admin.ui.request_failed", "We couldn’t complete that request. Please try again.");
}

function amount(value: number, currency: string, formatPrice: (amount: number, currency: string) => string) {
	return formatPrice(value / (currency === "JPY" || currency === "KRW" || currency === "IDR" ? 1 : 100), currency);
}

function date(value: string) {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function AdminLanguageSelect({ language, setLanguage, label }: {
	language: string;
	setLanguage: (language: string) => Promise<void>;
	label: string;
}) {
	return <label className="ad-language-control">
		<span>{label}</span>
		<select aria-label={label} value={language} onChange={(event) => void setLanguage(event.target.value)}>
			<option value="en">English</option>
			<option value="ja">日本語</option>
			<option value="ko">한국어</option>
		</select>
	</label>;
}

function periodLabel(value: string) {
	const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(parsed.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parsed);
}

function AnalyticsTrendChart({ series, labels }: {
	series: AdminAnalytics["series"];
	labels: Record<"orders" | "reservations" | "interests" | "newCustomers", string>;
}) {
	const metrics = ["orders", "reservations", "interests", "newCustomers"] as const;
	const maximum = Math.max(1, ...series.flatMap((row) => metrics.map((metric) => row[metric])));
	const x = (index: number) => series.length <= 1 ? 310 : 42 + (index * 516) / (series.length - 1);
	const y = (value: number) => 158 - (value / maximum) * 126;
	const colors = { orders: "#d37c5a", reservations: "#7c9b83", interests: "#9684b8", newCustomers: "#6b9db2" };
	return <div className="ad-analytics-chart">
		{series.length ? <svg viewBox="0 0 600 205" role="img" aria-label={labels.orders}>
			<title>{labels.orders}</title>
			{[32, 95, 158].map((lineY) => <line key={lineY} x1="42" x2="558" y1={lineY} y2={lineY} className="ad-chart-gridline" />)}
			{metrics.map((metric) => <polyline
				key={metric}
				points={series.map((row, index) => `${x(index)},${y(row[metric])}`).join(" ")}
				fill="none"
				stroke={colors[metric]}
				strokeWidth="3"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>)}
			<text x="42" y="190" className="ad-chart-axis-label">{periodLabel(series[0].period)}</text>
			{series.length > 1 && <text x="558" y="190" textAnchor="end" className="ad-chart-axis-label">{periodLabel(series[series.length - 1].period)}</text>}
		</svg> : <div className="ad-empty">No activity in this date range.</div>}
		<div className="ad-chart-legend">{metrics.map((metric) => <span key={metric}><i style={{ backgroundColor: colors[metric] }} />{labels[metric]}</span>)}</div>
	</div>;
}

function RevenueChart({ currency, data, formatPrice }: {
	currency: string;
	data: AdminAnalytics["revenueSeries"];
	formatPrice: (amount: number, currency: string) => string;
}) {
	const maximum = Math.max(1, ...data.map((row) => Math.abs(row.netAmount)));
	const step = 516 / Math.max(data.length, 1);
	return <div className="ad-analytics-chart">
		<svg viewBox="0 0 600 210" role="img" aria-label={`Net revenue in ${currency}`}>
			<title>Net revenue in {currency}</title>
			{[24, 92, 160].map((lineY) => <line key={lineY} x1="42" x2="558" y1={lineY} y2={lineY} className="ad-chart-gridline" />)}
			<line x1="42" x2="558" y1="92" y2="92" className="ad-chart-zero-line" />
			{data.map((row, index) => {
				const height = Math.abs(row.netAmount) / maximum * 65;
				const x = 42 + index * step + step * .2;
				const y = row.netAmount < 0 ? 92 : 92 - height;
				return <g key={row.period}>
					<rect x={x} y={y} width={Math.max(3, step * .6)} height={Math.max(1, height)} rx="3" className={row.netAmount < 0 ? "ad-chart-bar ad-chart-bar--negative" : "ad-chart-bar"} />
					<title>{periodLabel(row.period)} · net {amount(row.netAmount, currency, formatPrice)} · captured {amount(row.capturedAmount, currency, formatPrice)} · refunded {amount(row.refundedAmount, currency, formatPrice)}</title>
				</g>;
			})}
			{data.length > 0 && <text x="42" y="194" className="ad-chart-axis-label">{periodLabel(data[0].period)}</text>}
			{data.length > 1 && <text x="558" y="194" textAnchor="end" className="ad-chart-axis-label">{periodLabel(data[data.length - 1].period)}</text>}
		</svg>
		<div className="ad-chart-legend"><span><i className="ad-chart-bar-key" />Net captured</span><span>{data.length} periods</span></div>
	</div>;
}

function revenueChartRows(
	analytics: AdminAnalytics,
	series: AdminAnalytics["series"],
	currency: string,
) {
	const byPeriod = new Map(analytics.revenueSeries
		.filter((row) => row.currency === currency)
		.map((row) => [row.period.slice(0, 10), row]));
	return series.map((row) => byPeriod.get(row.period.slice(0, 10)) ?? {
		period: row.period,
		currency,
		capturedAmount: 0,
		refundedAmount: 0,
		netAmount: 0,
	});
}

export default function AdminPortalPage() {
	const { formatPrice, language, setLanguage, t } = useLocalization();
	const ui = (key: string, fallback: string, values?: Record<string, string | number>) => t(`admin.ui.${key}`, fallback, values);
	const [admin, setAdmin] = useState<AdminIdentity | null>(null);
	const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
	const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
	const [analyticsRange, setAnalyticsRange] = useState<AdminAnalytics["period"]["range"]>("30d");
	const [orders, setOrders] = useState<OrderPage>({ items: [], total: 0, limit: 50, offset: 0 });
	const [products, setProducts] = useState<ProductPage>({ items: [], total: 0, limit: 100, offset: 0 });
	const [suppliers, setSuppliers] = useState<AdminSupplier[]>([]);
	const [brands, setBrands] = useState<AdminBrand[]>([]);
	const [reservationProducts, setReservationProducts] = useState<AdminProduct[]>([]);
	const [interestProducts, setInterestProducts] = useState<AdminProduct[]>([]);
	const [reservationTab, setReservationTab] = useState<"reservations" | "interests">("reservations");
	const [reservationEntries, setReservationEntries] = useState<AdminReservationPage>({ items: [], total: 0, limit: 50, offset: 0 });
	const [reservationFilters, setReservationFilters] = useState({ productId: "", country: "", query: "" });
	const [appliedReservationFilters, setAppliedReservationFilters] = useState({ productId: "", country: "", query: "" });
	const [reservationEntriesLoading, setReservationEntriesLoading] = useState(false);
	const [reservationExporting, setReservationExporting] = useState(false);
	const [emailInboxStatus, setEmailInboxStatus] = useState<AdminEmailInboxStatus | null>(null);
	const [emailThreads, setEmailThreads] = useState<AdminEmailThread[]>([]);
	const [emailInboxSummary, setEmailInboxSummary] = useState<AdminEmailInboxSummary | null>(null);
	const [emailThreadTotal, setEmailThreadTotal] = useState(0);
	const [emailMailboxKey, setEmailMailboxKey] = useState("");
	const [emailStatusFilter, setEmailStatusFilter] = useState<EmailStatusFilter>("all");
	const [emailThreadKey, setEmailThreadKey] = useState("");
	const [emailThread, setEmailThread] = useState<AdminEmailThreadDetail | null>(null);
	const [emailThreadLoading, setEmailThreadLoading] = useState(false);
	const [emailQuery, setEmailQuery] = useState("");
	const [emailReplyBody, setEmailReplyBody] = useState("");
	const [emailReplyTemplate, setEmailReplyTemplate] = useState("");
	const [emailReplyIdempotencyKey, setEmailReplyIdempotencyKey] = useState("");
	const [emailReplyIdempotencyScope, setEmailReplyIdempotencyScope] = useState("");
	const [makerApplications, setMakerApplications] = useState<AdminMakerApplication[]>([]);
	const [customers, setCustomers] = useState<AdminCustomer[]>([]);
	const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
	const [newAdmin, setNewAdmin] = useState({ firstName: "", lastName: "", email: "", password: "" });
	const [editingAdmin, setEditingAdmin] = useState<AdminAccountEditDraft | null>(null);
	const [section, setSection] = useState<AdminSection>("dashboard");
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

	const loadReservationEntries = useCallback(async (
		offset: number,
		filters = appliedReservationFilters,
	) => {
		setReservationEntriesLoading(true);
		setError("");
		try {
			const result = await ponyoApi.listAdminReservationEntries({
				productId: filters.productId || undefined,
				country: filters.country || undefined,
				q: filters.query.trim() || undefined,
				limit: 50,
				offset,
			});
			setReservationEntries(result);
			setAppliedReservationFilters(filters);
		} catch (requestError) {
			setError(messageFor(requestError, t));
		} finally {
			setReservationEntriesLoading(false);
		}
	}, [appliedReservationFilters, t]);

	const loadSection = useCallback(async (target: AdminSection, search = query) => {
		setError("");
		try {
			switch (target) {
				case "dashboard":
					setDashboard(await ponyoApi.getAdminDashboard());
					break;
				case "analytics":
					setAnalytics(await ponyoApi.getAdminAnalytics(analyticsRange));
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
					{
						const [reservations, interests] = await Promise.all([
							ponyoApi.listAdminReservations(),
							ponyoApi.listAdminInterests(),
						]);
						setReservationProducts(reservations);
						setInterestProducts(interests);
					}
					await loadReservationEntries(0);
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
				case "admin-accounts":
					setAdminAccounts(await ponyoApi.listAdminAccounts());
					break;
				case "email-inbox": {
					const status = await ponyoApi.getAdminEmailInboxStatus();
					setEmailInboxStatus(status);
					const mailboxKey = status.mailboxes.some((mailbox) => mailbox.key === emailMailboxKey)
						? emailMailboxKey
						: status.mailboxes[0]?.key ?? "";
					setEmailMailboxKey(mailboxKey);
					const inbox = await ponyoApi.listAdminEmailThreads(emailQuery, 100, 0, {
						mailboxKey: mailboxKey || undefined,
						status: emailStatusFilter,
					});
					setEmailThreads(inbox.items);
					setEmailInboxSummary(inbox.summary);
					setEmailThreadTotal(inbox.total);
					break;
				}
			}
		} catch (requestError) {
			setError(messageFor(requestError, t));
		}
	}, [analyticsRange, emailMailboxKey, emailQuery, emailStatusFilter, publishedFilter, query, loadReservationEntries, t]);

	const loadAnalytics = useCallback(async (range = analyticsRange) => {
		setError("");
		try {
			setAnalytics(await ponyoApi.getAdminAnalytics(range));
		} catch (requestError) {
			setError(messageFor(requestError, t));
		}
	}, [analyticsRange, t]);

	const loadEmailThreads = useCallback(async (
		search = emailQuery,
		mailboxKey = emailMailboxKey,
		filter = emailStatusFilter,
	) => {
		setError("");
		try {
			const inbox = await ponyoApi.listAdminEmailThreads(search, 100, 0, {
				mailboxKey: mailboxKey || undefined,
				status: filter,
			});
			setEmailThreads(inbox.items);
			setEmailInboxSummary(inbox.summary);
			setEmailThreadTotal(inbox.total);
		} catch (requestError) {
			setError(messageFor(requestError, t));
		}
	}, [emailMailboxKey, emailQuery, emailStatusFilter, t]);

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
			if (active && requestError instanceof ApiNotConfiguredError) setError(messageFor(requestError, t));
		}).finally(() => {
			if (active) setLoading(false);
		});
		return () => { active = false; };
	}, [t]);

	useEffect(() => {
		if (!admin || !selectedOrderId || section !== "orders") return;
		let active = true;
		void ponyoApi.getAdminOrder(selectedOrderId).then((row) => { if (active) setOrderDetail(row); })
			.catch((requestError: unknown) => { if (active) setError(messageFor(requestError, t)); });
		return () => { active = false; };
	}, [admin, section, selectedOrderId, t]);

	useEffect(() => {
		if (!admin || section !== "email-inbox" || !emailInboxSummary?.pending) return;
		const timer = window.setInterval(() => { void loadEmailThreads(); }, 5000);
		return () => window.clearInterval(timer);
	}, [admin, section, emailInboxSummary?.pending, loadEmailThreads]);

	const productView = useMemo(() => publishedFilter === "pending" ? products.items.filter((product) => !product.published) : products.items, [products.items, publishedFilter]);
	const reservationCountryTotals = useMemo(() => aggregateReservationsByCountry(reservationProducts), [reservationProducts]);
	const analyticsTrendSeries = useMemo(() => {
		if (!analytics) return [];
		const existing = new Map(analytics.series.map((row) => [row.period.slice(0, 10), row]));
		const end = analytics.period.to.slice(0, 10);
		const start = analytics.period.bucket === "month"
			? analytics.series[0]?.period.slice(0, 10) ?? `${end.slice(0, 7)}-01`
			: analytics.period.from?.slice(0, 10) ?? end;
		const cursor = new Date(`${start}T00:00:00.000Z`);
		const last = new Date(`${end}T00:00:00.000Z`);
		if (analytics.period.bucket === "month") cursor.setUTCDate(1);
		const periods: string[] = [];
		while (cursor <= last) {
			periods.push(cursor.toISOString().slice(0, 10));
			if (analytics.period.bucket === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
			else cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		return periods.map((period) => existing.get(period) ?? {
			period, orders: 0, paidOrders: 0, reservations: 0, interests: 0, newCustomers: 0,
		});
	}, [analytics]);

	function navigateSection(target: AdminSection) {
		setSection(target);
		setQuery("");
		setSelectedOrderId("");
		setOrderDetail(null);
		setError("");
		if (target !== "dashboard") void loadSection(target, "");
	}

	async function exportReservationEntries() {
		setReservationExporting(true);
		setError("");
		try {
			const file = await ponyoApi.downloadAdminReservationsXlsx({
				productId: appliedReservationFilters.productId || undefined,
				country: appliedReservationFilters.country || undefined,
				q: appliedReservationFilters.query.trim() || undefined,
			});
			const url = URL.createObjectURL(file);
			const link = document.createElement("a");
			link.href = url;
			link.download = "ponyo-reservations.xlsx";
			document.body.append(link);
			link.click();
			link.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 0);
			setNotice(t("admin.reservations.export_ready", "Filtered Excel report downloaded."));
		} catch (requestError) {
			setError(messageFor(requestError, t));
		} finally {
			setReservationExporting(false);
		}
	}

	async function createAdminAccount(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusyId("create-admin");
		setError("");
		try {
			const account = await ponyoApi.createAdminAccount(newAdmin);
			setAdminAccounts((current) => [...current, account]);
			setNewAdmin({ firstName: "", lastName: "", email: "", password: "" });
			setNotice(ui("admin_account_created", "Admin access created for {{email}}.", { email: account.email }));
		} catch (requestError) {
			setError(messageFor(requestError, t));
		} finally {
			setBusyId("");
		}
	}

	function startAdminAccountEdit(account: AdminAccount) {
		setEditingAdmin({
			id: account.id,
			firstName: account.firstName,
			lastName: account.lastName,
			email: account.email,
			password: "",
		});
		setError("");
		setNotice("");
	}

	async function saveAdminAccount(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!editingAdmin) return;
		const previousAccount = adminAccounts.find((account) => account.id === editingAdmin.id);
		if (!previousAccount) {
			setError(ui("admin_account_missing", "That admin account is no longer available. Refresh and try again."));
			return;
		}
		const credentialsChanged =
			editingAdmin.email.trim().toLowerCase() !== previousAccount.email.toLowerCase() ||
			Boolean(editingAdmin.password);
		setBusyId(editingAdmin.id);
		setError("");
		try {
			const updated = await ponyoApi.updateAdminAccount(editingAdmin.id, {
				firstName: editingAdmin.firstName,
				lastName: editingAdmin.lastName,
				email: editingAdmin.email,
				...(editingAdmin.password ? { password: editingAdmin.password } : {}),
			});
			setAdminAccounts((current) => current.map((account) => account.id === updated.id ? updated : account));
			setEditingAdmin(null);
			if (updated.id === admin?.id && credentialsChanged) {
				setAdmin(null);
				setNotice(ui("admin_account_updated_sign_in", "Your sign-in details changed. Sign in again with the updated credentials."));
			} else {
				if (updated.id === admin?.id) {
					setAdmin((current) => current ? {
						...current,
						firstName: updated.firstName,
						lastName: updated.lastName,
						email: updated.email,
					} : current);
				}
				setNotice(ui("admin_account_updated", "Admin account updated for {{email}}.", { email: updated.email }));
			}
		} catch (requestError) {
			setError(messageFor(requestError, t));
		} finally {
			setBusyId("");
		}
	}

	async function revokeAdminAccount(account: AdminAccount) {
		if (account.id === admin?.id || adminAccounts.length <= 1) {
			setError(ui("admin_access_protected_hint", "You cannot revoke your own or the last admin account."));
			return;
		}
		if (!window.confirm(ui(
			"revoke_admin_confirm",
			"Revoke admin access for {{email}}? The account and its history will be kept.",
			{ email: account.email },
		))) return;
		setBusyId(account.id);
		setError("");
		try {
			await ponyoApi.revokeAdminAccess(account.id);
			setAdminAccounts((current) => current.filter((entry) => entry.id !== account.id));
			if (editingAdmin?.id === account.id) setEditingAdmin(null);
			setNotice(ui("admin_access_revoked", "Admin access revoked for {{email}}. The account and history were kept.", {
				email: account.email,
			}));
		} catch (requestError) {
			setError(messageFor(requestError, t));
		} finally {
			setBusyId("");
		}
	}

	async function openEmailThread(threadKey: string) {
		setEmailThreadKey(threadKey);
		setEmailThreadLoading(true);
		setError("");
		try {
			const detail = await ponyoApi.getAdminEmailThread(threadKey);
			setEmailThread(detail);
			setEmailThreads((current) => current.map((thread) => thread.threadKey === threadKey
				? { ...thread, unreadCount: 0 }
				: thread));
		} catch (requestError) {
			setError(messageFor(requestError, t));
		} finally {
			setEmailThreadLoading(false);
		}
	}

	async function syncEmailInbox() {
		setBusyId("email-sync");
		setError("");
		try {
			const result = await ponyoApi.syncAdminEmailInbox();
			const status = await ponyoApi.getAdminEmailInboxStatus();
			setEmailInboxStatus(status);
			const inbox = await ponyoApi.listAdminEmailThreads(emailQuery, 100, 0, {
				mailboxKey: emailMailboxKey || undefined,
				status: emailStatusFilter,
			});
			setEmailThreads(inbox.items);
			setEmailInboxSummary(inbox.summary);
			setEmailThreadTotal(inbox.total);
			const failedMailboxes = result.mailboxes.filter((mailbox) => mailbox.lastError);
			setNotice(result.imapConfigured
				? ui("email_sync_complete", "Inbox sync complete. {{mailbox}} mailbox messages and {{portal}} storefront messages added; {{failed}} mailboxes failed.", { mailbox: result.importedMailboxMessages, portal: result.importedPortalMessages, failed: failedMailboxes.length })
				: ui("email_portal_only", "Storefront messages are ready. Configure IMAP to sync your mailbox."));
		} catch (requestError) {
			setError(messageFor(requestError, t));
			try {
				setEmailInboxStatus(await ponyoApi.getAdminEmailInboxStatus());
			} catch (statusError) {
				setError(messageFor(statusError, t));
			}
		} finally {
			setBusyId("");
		}
	}

	async function sendEmailReply(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!emailThread || !emailReplyBody.trim()) return;
		setBusyId("email-reply");
		setError("");
		const body = emailReplyBody.trim();
		const scope = JSON.stringify([emailThread.threadKey, body]);
		const idempotencyKey = emailReplyIdempotencyScope === scope && emailReplyIdempotencyKey
			? emailReplyIdempotencyKey
			: crypto.randomUUID();
		setEmailReplyIdempotencyKey(idempotencyKey);
		setEmailReplyIdempotencyScope(scope);
		try {
			const result = await ponyoApi.replyAdminEmailThread(emailThread.threadKey, {
				body,
				idempotencyKey,
			});
			setEmailReplyBody("");
			setEmailReplyTemplate("");
			setEmailReplyIdempotencyKey("");
			setEmailReplyIdempotencyScope("");
			setNotice(result.alreadyQueued
				? ui("email_reply_already_queued", "This reply was already queued.")
				: ui("email_reply_queued", "Reply queued for delivery."));
			await Promise.all([
				openEmailThread(emailThread.threadKey),
				loadEmailThreads(),
			]);
		} catch (requestError) {
			setError(messageFor(requestError, t));
		} finally {
			setBusyId("");
		}
	}

	async function handleLogin(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusyId("login");
		setError("");
		try {
			const identity = await ponyoApi.loginAdmin(email, password);
			setAdmin(identity);
			setPassword("");
			setNotice(ui("login_welcome", "Welcome to Ponyo operations, {{name}}.", { name: identity.firstName || ui("admin_fallback", "Admin") }));
			setDashboard(await ponyoApi.getAdminDashboard());
		} catch (requestError) {
			setError(messageFor(requestError, t));
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
		setAdminAccounts([]);
		setEmailInboxStatus(null);
		setEmailThreads([]);
		setEmailThread(null);
		setEmailThreadKey("");
		setEmailReplyBody("");
		setEmailReplyIdempotencyKey("");
		setOrderDetail(null);
		setSelectedOrderId("");
		setBusyId("");
	}

	async function togglePublication(product: AdminProduct) {
		setBusyId(product.id);
		try {
			await ponyoApi.setAdminProductPublication(product.id, !product.published);
			setNotice(ui(product.published ? "product_unpublished" : "product_published", product.published ? "{{name}} unpublished." : "{{name}} published.", { name: product.name }));
			await loadSection("products");
			setDashboard(await ponyoApi.getAdminDashboard());
		} catch (requestError) { setError(messageFor(requestError, t)); }
		finally { setBusyId(""); }
	}

	async function toggleSupplier(supplier: AdminSupplier) {
		setBusyId(supplier.id);
		try {
			await ponyoApi.setAdminSupplierActive(supplier.id, !supplier.active);
			setNotice(ui(supplier.active ? "supplier_paused" : "supplier_activated", supplier.active ? "{{name}} paused." : "{{name}} activated.", { name: supplier.name }));
			await loadSection("suppliers");
			setDashboard(await ponyoApi.getAdminDashboard());
		} catch (requestError) { setError(messageFor(requestError, t)); }
		finally { setBusyId(""); }
	}

	async function planSupplierOrders(order: AdminOrder) {
		setBusyId(order.id);
		try {
			const result = await ponyoApi.planAdminSupplierOrders(order.id);
			setNotice(result.createdPurchaseOrders.length
				? ui(result.createdPurchaseOrders.length === 1 ? "supplier_po_created_one" : "supplier_po_created_other", "Created {{count}} supplier purchase orders.", { count: result.createdPurchaseOrders.length })
				: ui("supplier_routing_current", "Supplier routing is already up to date for this order."));
			await loadSection(section);
			if (selectedOrderId === order.id) setOrderDetail(await ponyoApi.getAdminOrder(order.id));
		} catch (requestError) { setError(messageFor(requestError, t)); }
		finally { setBusyId(""); }
	}

	async function updateMakerApplication(application: AdminMakerApplication, status: MakerApplicationStatus) {
		setBusyId(application.id);
		try {
			await ponyoApi.setAdminMakerApplicationStatus(application.id, status);
			setMakerApplications((current) => current.map((item) => item.id === application.id ? { ...item, status } : item));
			setNotice(ui("application_updated", "Application status updated for {{name}}.", { name: application.makerName }));
		} catch (requestError) { setError(messageFor(requestError, t)); }
		finally { setBusyId(""); }
	}

	if (loading) return <main className="ad-boot"><Image src="/ponyo-jellyfish.svg" alt="" width={44} height={44} /><span>{ui("loading", "Opening Ponyo control room…")}</span></main>;

	if (!admin) return <main className="ad-login-page">
		<div className="ad-login-glow ad-login-glow--one" /><div className="ad-login-glow ad-login-glow--two" />
		<div className="ad-login-topbar"><Link className="ad-wordmark" href="/" aria-label={ui("home", "Ponyo home")}><Image src="/ponyo-jellyfish.svg" alt="" width={42} height={42} /><span>PONYO<small>{ui("operations", "MARKETPLACE OPERATIONS")}</small></span></Link><AdminLanguageSelect language={language} setLanguage={setLanguage} label={ui("language", "Language")} /></div>
		<section className="ad-login-card"><div className="ad-login-art"><Image src="/ponyo-jellyfish.svg" alt="" width={75} height={75} /><span>✦</span><i>✧</i></div><p className="ad-eyebrow">{ui("control_room", "THE PONYO CONTROL ROOM")}</p><h1>{ui("login_title_lead", "Good things,")}<br /><em>{ui("login_title_accent", "under control.")}</em></h1><p className="ad-login-copy">{ui("login_body", "Sign in to manage Ponyo’s curated marketplace, partners and operations.")}</p>
			{error && <div className="ad-alert ad-alert--error" role="alert">{error}</div>}
			<form className="ad-login-form" onSubmit={handleLogin}><label>{ui("email", "Admin email")}<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={ui("email_placeholder", "you@ponyo.com")} /></label><label>{ui("password", "Password")}<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={ui("password_placeholder", "Your secure password")} /></label><button className="ad-primary-button" type="submit" disabled={busyId === "login"}>{busyId === "login" ? ui("signing_in", "Signing in…") : ui("enter_dashboard", "Enter admin dashboard")}<span>↗</span></button></form>
			<p className="ad-login-footnote">{ui("login_footnote", "Admin access is provisioned by Ponyo operations. Customer and supplier accounts cannot enter.")}</p>
		</section><footer className="ad-login-footer">{ui("login_footer", "One thoughtful detail at a time")} <span>♡</span></footer>
	</main>;

	const metrics = dashboard?.metrics;
	const cards = [
		[ui("metric_total_orders", "TOTAL ORDERS"), metrics?.totalOrders ?? 0, ui("metric_marketplace_orders", "Marketplace orders"), "peach"],
		[ui("metric_paid_orders", "PAID ORDERS"), metrics?.paidOrders ?? 0, ui("metric_payment_received", "Payment received"), "mint"],
		[ui("metric_active_suppliers", "ACTIVE SUPPLIERS"), metrics?.activeSuppliers ?? 0, ui("metric_partners", "Marketplace partners"), "lilac"],
		[ui("metric_live_products", "LIVE PRODUCTS"), metrics?.activeProducts ?? 0, ui("metric_unpublished", "{{count}} unpublished", { count: metrics?.unpublishedProducts ?? 0 }), "blue"],
		[ui("metric_fulfillment_queue", "FULFILLMENT QUEUE"), metrics?.ordersAwaitingFulfillment ?? 0, ui("metric_paid_followup", "Paid orders to follow up"), "peach"],
		[ui("metric_low_availability", "LOW AVAILABILITY"), metrics?.lowAvailabilityVariants ?? 0, ui("metric_low_stock", "Variants at 3 units or less"), "mint"],
	] as const;
	const emailStatusCounts = emailInboxSummary?.byMailbox[emailMailboxKey];
	const emailFilterOptions: Array<{ key: EmailStatusFilter; label: string; count: number }> = [
		{ key: "all", label: ui("email_filter_all", "All"), count: emailStatusCounts?.total ?? emailThreadTotal },
		{ key: "unread", label: ui("email_filter_unread", "Unread"), count: emailStatusCounts?.unread ?? 0 },
		{ key: "needs_reply", label: ui("email_filter_needs_reply", "Needs reply"), count: emailStatusCounts?.needsReply ?? 0 },
		{ key: "replied", label: ui("email_filter_replied", "Replied"), count: emailStatusCounts?.replied ?? 0 },
		{ key: "pending", label: ui("email_filter_pending", "Pending"), count: emailStatusCounts?.pending ?? 0 },
		{ key: "failed", label: ui("email_filter_failed", "Failed"), count: emailStatusCounts?.failed ?? 0 },
	];

	return <main className={`ad-layout ${sidebarCollapsed ? "ad-layout--collapsed" : ""}`}>
		<aside className="ad-sidebar">
			<div className="ad-sidebar-head">
				<Link className="ad-brand" href="/" aria-label={ui("home", "Ponyo home")}><Image src="/ponyo-jellyfish.svg" alt="" width={38} height={38} /><span>PONYO<small>{ui("admin_studio", "ADMIN STUDIO")}</small></span></Link>
				<button className="ad-sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-expanded={!sidebarCollapsed} aria-controls="admin-navigation admin-mobile-navigation" aria-label={sidebarCollapsed ? ui("expand_sidebar", "Expand sidebar") : ui("collapse_sidebar", "Collapse sidebar")}>{sidebarCollapsed ? "»" : "«"}</button>
			</div>
			<div className="ad-sidebar-rule" /><p className="ad-sidebar-label">{ui("marketplace", "MARKETPLACE")}</p>
			<nav className="ad-nav" id="admin-navigation" aria-label={ui("marketplace", "Marketplace")}>{navigation.map((item) => <button key={item.id} className={`ad-nav-item ${section === item.id ? "is-active" : ""}`} type="button" onClick={() => navigateSection(item.id)} aria-label={sidebarCollapsed ? ui(item.labelKey, item.label) : undefined} aria-current={section === item.id ? "page" : undefined}><span>{item.icon}</span><span className="ad-nav-copy"><strong>{ui(item.labelKey, item.label)}</strong><small>{ui(item.hintKey, item.hint)}</small></span></button>)}</nav>
			<nav className="ad-mobile-nav" id="admin-mobile-navigation" aria-label={ui("marketplace", "MARKETPLACE")}>{navigation.map((item) => <button key={item.id} className={section === item.id ? "is-active" : ""} type="button" onClick={() => navigateSection(item.id)} aria-current={section === item.id ? "page" : undefined}>{ui(item.labelKey, item.label)}</button>)}</nav>
			<div className="ad-sidebar-note"><span>✦</span><strong>{ui("sidebar_tagline", "Thoughtfully found. Ready to be loved.")}</strong><small>{ui("sidebar_note", "The little details make the whole marketplace.")}</small></div>
			<div className="ad-account"><span className="ad-avatar">{admin.firstName.slice(0, 1).toUpperCase() || "A"}</span><div><strong>{admin.firstName} {admin.lastName}</strong><small>{admin.email}</small></div><button type="button" onClick={() => void logout()} disabled={busyId === "logout"} aria-label={ui("sign_out", "Sign out")}>↗</button></div>
		</aside>
		<section className="ad-main"><header className="ad-topbar"><div><span className="ad-eyebrow">{ui("management", "PONYO MARKETPLACE MANAGEMENT")}</span><h1>{section === "dashboard" ? ui("good_morning", "Good morning, {{name}}", { name: admin.firstName || ui("admin_fallback", "Admin") }) : ui(navigation.find((item) => item.id === section)?.labelKey ?? "dashboard", navigation.find((item) => item.id === section)?.label ?? "Dashboard")}<span> ✦</span></h1><p>{ui(navigation.find((item) => item.id === section)?.hintKey ?? "dashboard_hint", navigation.find((item) => item.id === section)?.hint ?? "Marketplace overview")} · {ui("dashboard_subtitle", "One calm view of the moving parts.")}</p></div><div className="ad-topbar-actions"><AdminLanguageSelect language={language} setLanguage={setLanguage} label={ui("language", "Language")} /><button className="ad-refresh" type="button" onClick={() => void refreshAll()} disabled={refreshing}>{refreshing ? ui("refreshing", "Refreshing…") : `↻ ${ui("refresh", "Refresh")}`}</button></div></header>
			{notice && <div className="ad-alert ad-alert--success" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label={ui("dismiss", "Dismiss")}>×</button></div>}{error && <div className="ad-alert ad-alert--error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label={ui("dismiss", "Dismiss")}>×</button></div>}
			{section === "dashboard" && <>
				<div className="ad-metrics">{cards.map(([label, value, note, tone]) => <article className={`ad-metric ad-metric--${tone}`} key={label}><small>{label}</small><strong>{value}</strong><span>{note}</span></article>)}</div>
				<div className="ad-dashboard-grid"><section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("recent_activity", "RECENT ACTIVITY")}</span><h2>{ui("latest_orders", "Latest orders")}</h2></div><button type="button" onClick={() => navigateSection("orders")}>{ui("view_all", "View all")} ↗</button></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>{ui("table_order", "ORDER")}</th><th>{ui("table_customer", "CUSTOMER")}</th><th>{ui("table_status", "STATUS")}</th><th>{ui("table_total", "TOTAL")}</th></tr></thead><tbody>{dashboard?.recentOrders.map((order) => <tr key={order.id} onClick={() => { setSelectedOrderId(order.id); setOrderDetail(null); navigateSection("orders"); }}><td><strong>{order.orderNumber}</strong><small>{date(order.createdAt)}</small></td><td>{order.customerEmail}</td><td><span className={`ad-status ad-status--${order.status}`}>{order.status.replaceAll("_", " ")}</span></td><td>{amount(order.totalAmount, order.currency, formatPrice)}</td></tr>)}</tbody></table>{!dashboard?.recentOrders.length && <div className="ad-empty">{ui("no_orders", "No orders yet.")}</div>}</div></section>
					<section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("partner_pulse", "PONYO PARTNERS")}</span><h2>{ui("supplier_pulse", "Supplier pulse")}</h2></div><button type="button" onClick={() => setSection("suppliers")}>{ui("suppliers", "Suppliers")} ↗</button></div><div className="ad-supplier-list">{dashboard?.suppliers.map((supplier) => <div className="ad-supplier-row" key={supplier.id}><span className="ad-supplier-mark">✿</span><span><strong>{supplier.name}</strong><small>{supplier.code} · {ui("supplier_accounts", "{{count}} accounts", { count: supplier.accountCount })}</small></span><i className={supplier.active ? "is-live" : ""}>{supplier.active ? ui("active", "Active") : ui("paused", "Paused")}</i></div>)}</div><div className="ad-revenue-block"><small>{ui("revenue_heading", "CAPTURED LESS REFUNDS · BY CURRENCY")}</small>{dashboard?.revenueByCurrency.length ? dashboard.revenueByCurrency.map((row) => <strong key={row.currency}>{amount(row.amount, row.currency, formatPrice)}</strong>) : <strong>{ui("no_captured_revenue", "No captured revenue yet")}</strong>}<span>{ui("currency_totals_note", "Currency totals stay separate; no implicit FX conversion.")}</span></div></section>
				</div>
				<section className="ad-panel ad-pending-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("curated_by_ponyo", "CURATED BY PONYO")}</span><h2>{ui("unpublished_catalog", "Unpublished catalog")}</h2></div><button type="button" onClick={() => navigateSection("products")}>{ui("open_catalog", "Open catalog")} ↗</button></div><div className="ad-pending-list">{dashboard?.unpublishedProducts.map((product) => <article key={product.id}><Image src={product.image} alt="" width={54} height={54} /><span><strong>{product.name}</strong><small>{product.sku} · {ui("variants", "{{count}} variants", { count: product.variantCount })}</small></span><button type="button" disabled={busyId === product.id} onClick={() => void togglePublication(product)}>{busyId === product.id ? ui("saving", "Saving…") : ui("publish_listing", "Publish listing")}</button></article>)}{!dashboard?.unpublishedProducts.length && <div className="ad-empty">{ui("no_unpublished", "No unpublished products in the catalog.")}</div>}</div></section>
			</>}
			{section === "analytics" && <>
				<div className="ad-toolbar ad-analytics-toolbar">
					<label>{ui("analytics_range", "Date range")}
						<select value={analyticsRange} onChange={(event) => {
							const range = event.target.value as AdminAnalytics["period"]["range"];
							setAnalyticsRange(range);
							void loadAnalytics(range);
						}}>
							<option value="7d">{ui("analytics_7d", "Last 7 days")}</option>
							<option value="30d">{ui("analytics_30d", "Last 30 days")}</option>
							<option value="90d">{ui("analytics_90d", "Last 90 days")}</option>
							<option value="all">{ui("analytics_all", "All time")}</option>
						</select>
					</label>
					<span>{ui("analytics_currency_note", "Currencies are shown separately; no exchange-rate conversion is applied.")}</span>
				</div>
				{analytics && <>
					<div className="ad-metrics ad-analytics-metrics">
						<article className="ad-metric ad-metric--peach"><small>{ui("analytics_orders", "ORDERS")}</small><strong>{analytics.summary.orders}</strong><span>{ui("analytics_paid_orders", "{{count}} paid", { count: analytics.summary.paidOrders })}</span></article>
						<article className="ad-metric ad-metric--mint"><small>{ui("analytics_reservations", "RESERVATIONS")}</small><strong>{analytics.summary.reservations}</strong><span>{ui("analytics_reservation_interest", "{{count}} interest requests", { count: analytics.summary.interests })}</span></article>
						<article className="ad-metric ad-metric--lilac"><small>{ui("analytics_customers", "NEW CUSTOMERS")}</small><strong>{analytics.summary.newCustomers}</strong><span>{ui("analytics_period_hint", "In the selected period")}</span></article>
						{analytics.summary.revenueByCurrency.map((row) => <article className="ad-metric ad-metric--blue" key={row.currency}><small>{ui("analytics_net_revenue", "NET REVENUE · {{currency}}", { currency: row.currency })}</small><strong>{amount(row.netAmount, row.currency, formatPrice)}</strong><span>{ui("analytics_refunds", "Refunds {{amount}}", { amount: amount(row.refundedAmount, row.currency, formatPrice) })}</span></article>)}
					</div>
					<div className="ad-dashboard-grid ad-analytics-grid">
						<section className="ad-panel">
							<div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("analytics_activity_eyebrow", "MARKETPLACE ACTIVITY")}</span><h2>{ui("analytics_activity_title", "Demand & customer trend")}</h2></div></div>
							<AnalyticsTrendChart series={analyticsTrendSeries} labels={{
								orders: ui("analytics_orders", "Orders"),
								reservations: ui("analytics_reservations", "Reservations"),
								interests: ui("analytics_interests", "Interests"),
								newCustomers: ui("analytics_customers", "New customers"),
							}} />
						</section>
						<section className="ad-panel">
							<div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("analytics_top_products_eyebrow", "PRODUCT MOMENTUM")}</span><h2>{ui("analytics_top_products", "Top products by units ordered")}</h2></div></div>
							<div className="ad-analytics-ranking">{analytics.topProducts.map((product, index) => <div key={product.name}><span>{index + 1}</span><strong>{product.name}</strong><b>{ui("analytics_units", "{{count}} units", { count: product.unitsSold })}</b></div>)}{!analytics.topProducts.length && <div className="ad-empty">{ui("analytics_no_products", "No paid product orders in this range.")}</div>}</div>
						</section>
					</div>
					<section className="ad-panel ad-analytics-revenue-panel">
						<div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("analytics_revenue_eyebrow", "REVENUE & REFUNDS")}</span><h2>{ui("analytics_revenue_title", "Captured revenue by currency")}</h2><p>{ui("analytics_revenue_note", "Each chart uses its own currency scale. Refunds are subtracted from captured payments.")}</p></div></div>
						<div className="ad-analytics-revenue-grid">{analytics.summary.revenueByCurrency.map((row) => <article className="ad-analytics-currency" key={row.currency}>
							<header><strong>{row.currency}</strong><span>{ui("analytics_net_revenue", "Net revenue · {{currency}}", { currency: row.currency })} <b>{amount(row.netAmount, row.currency, formatPrice)}</b></span></header>
							<div className="ad-analytics-currency-totals"><span>{ui("analytics_captured", "Captured")} {amount(row.capturedAmount, row.currency, formatPrice)}</span><span>{ui("analytics_refunds", "Refunds")} {amount(row.refundedAmount, row.currency, formatPrice)}</span></div>
							<RevenueChart currency={row.currency} data={revenueChartRows(analytics, analyticsTrendSeries, row.currency)} formatPrice={formatPrice} />
						</article>)}
						{!analytics.summary.revenueByCurrency.length && <div className="ad-empty">{ui("analytics_no_revenue", "No captured revenue in this date range.")}</div>}</div>
					</section>
					<div className="ad-dashboard-grid ad-analytics-grid">
						<section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("analytics_country_eyebrow", "CUSTOMER DEMAND")}</span><h2>{ui("analytics_reservations_by_country", "Reservations by country")}</h2></div></div><div className="ad-analytics-ranking">{analytics.reservationsByCountry.map((row, index) => <div key={row.country}><span>{index + 1}</span><strong>{regionName(row.country, language, row.country)}</strong><b>{ui("analytics_requests", "{{count}} requests", { count: row.count })}</b></div>)}{!analytics.reservationsByCountry.length && <div className="ad-empty">{ui("analytics_no_country_data", "No country data in this range.")}</div>}</div></section>
						<section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("analytics_interests_by_country_eyebrow", "EARLY INTEREST")}</span><h2>{ui("analytics_interests_by_country", "Interest requests by country")}</h2></div></div><div className="ad-analytics-ranking">{analytics.interestsByCountry.map((row, index) => <div key={row.country}><span>{index + 1}</span><strong>{regionName(row.country, language, row.country)}</strong><b>{ui("analytics_requests", "{{count}} requests", { count: row.count })}</b></div>)}{!analytics.interestsByCountry.length && <div className="ad-empty">{ui("analytics_no_country_data", "No country data in this range.")}</div>}</div></section>
					</div>
				</>}
			</>}
			{section === "orders" && <><div className="ad-toolbar"><label className="ad-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSection("orders", query); }} placeholder="Order number or customer email" /></label><button type="button" onClick={() => void loadSection("orders")}>Search orders</button><span>{orders.total} orders</span></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PAYMENT</th><th>FULFILLMENT</th><th>SUPPLIER</th><th>TOTAL</th></tr></thead><tbody>{orders.items.map((order) => <tr key={order.id} className={selectedOrderId === order.id ? "is-selected" : ""} onClick={() => { setSelectedOrderId(order.id); setOrderDetail(null); }}><td><strong>{order.orderNumber}</strong><small>{date(order.createdAt)}</small></td><td>{order.customerEmail}</td><td><span className="ad-status">{order.paymentStatus}</span></td><td>{order.fulfillmentStatus.replaceAll("_", " ")}</td><td>{order.supplierFulfillmentStatus.replaceAll("_", " ")}</td><td>{amount(order.totalAmount, order.currency, formatPrice)}</td></tr>)}</tbody></table></div></section>{orderDetail && <section className="ad-panel ad-order-detail"><div className="ad-panel-heading"><div><span className="ad-eyebrow">ORDER DETAIL · {orderDetail.paymentStatus}</span><h2>{orderDetail.orderNumber}</h2><p>{orderDetail.customerEmail} · {orderDetail.fulfillmentStatus.replaceAll("_", " ")}</p></div><button type="button" onClick={() => { setOrderDetail(null); setSelectedOrderId(""); }}>Close</button></div><div className="ad-order-facts"><span>Subtotal <strong>{amount(orderDetail.subtotalAmount, orderDetail.currency, formatPrice)}</strong></span><span>Discount <strong>{amount(orderDetail.discountAmount, orderDetail.currency, formatPrice)}</strong></span><span>Shipping <strong>{amount(orderDetail.shippingAmount, orderDetail.currency, formatPrice)}</strong></span><span>Captured <strong>{amount(orderDetail.capturedAmount, orderDetail.currency, formatPrice)}</strong></span><span>Refunded <strong>{amount(orderDetail.refundedAmount, orderDetail.currency, formatPrice)}</strong></span><span>Total <strong>{amount(orderDetail.totalAmount, orderDetail.currency, formatPrice)}</strong></span></div><div className="ad-detail-columns"><section><h3>Customer order lines</h3>{orderDetail.items.map((line) => <article key={line.id}><span><strong>{line.name}</strong><small>Qty {line.quantity} · {line.supplierOfferId ? "Supplier linked" : "Legacy / not routed"}</small></span><b>{amount(line.unitPrice * line.quantity, line.currency, formatPrice)}</b></article>)}</section><section><h3>Supplier purchase orders</h3>{orderDetail.supplierFulfillments.map((po) => <article key={po.purchaseOrderId}><span><strong>{po.purchaseOrderNumber} · {po.supplier}</strong><small>{po.status.replaceAll("_", " ")} {po.supplierOrderId ? `· Ref ${po.supplierOrderId}` : ""}</small></span><small>{po.items.length} lines</small></article>)}{orderDetail.paymentStatus === "paid" && <button className="ad-row-action" type="button" disabled={busyId === orderDetail.id} onClick={() => { const row = orders.items.find((item) => item.id === orderDetail.id); if (row) void planSupplierOrders(row); }}>{busyId === orderDetail.id ? "Planning…" : "Plan / refresh supplier routing"}</button>}</section><section><h3>Shipments</h3>{orderDetail.shipments.map((shipment) => <article key={shipment.id}><span><strong>{shipment.number} · {shipment.carrier}</strong><small>{shipment.status.replaceAll("_", " ")} · {shipment.trackingNumber}</small></span>{shipment.trackingUrl && <a href={shipment.trackingUrl} target="_blank" rel="noreferrer">Track ↗</a>}</article>)}{!orderDetail.shipments.length && <p className="ad-detail-empty">No shipment records yet.</p>}</section></div></section>}</>}
			{section === "products" && <aside className="ad-product-intake-note" role="note"><strong>{ui("catalog_intake_title", "Product intake status")}</strong><p>{ui("catalog_intake_note", "This catalog lists products already in the database. Supplier accounts update offers and inventory; they do not submit new products. Maker applications are separate. New products need an approved data/import workflow before they appear here for review and publishing.")}</p></aside>}
			{section === "products" && <><div className="ad-toolbar"><label className="ad-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSection("products", query); }} placeholder="Product name, SKU or slug" /></label><select value={publishedFilter} onChange={(event) => { setPublishedFilter(event.target.value as typeof publishedFilter); }}><option value="all">All products</option><option value="pending">Unpublished</option><option value="published">Published</option></select><button type="button" onClick={() => void loadSection("products")}>Search catalog</button><span>{products.total} products</span></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>PRODUCT</th><th>BRAND / CATEGORY</th><th>VARIANTS</th><th>STOCK</th><th>PRICE</th><th>STATUS</th><th>ACTION / SHIPPING</th></tr></thead><tbody>{productView.map((product) => <tr key={product.id}><td><div className="ad-product-cell"><Image src={product.image} alt="" width={48} height={48} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td>{product.brandName}<small>{product.categoryName}</small></td><td>{product.variantCount}</td><td>{product.stockQuantity}</td><td>{amount(product.priceAmount, product.currency, formatPrice)}</td><td><span className={`ad-status ${product.published ? "ad-status--published" : "ad-status--pending"}`}>{product.published ? "Published" : "Unpublished"}</span></td><td><button className="ad-row-action" type="button" disabled={busyId === product.id} onClick={() => void togglePublication(product)}>{product.published ? "Unpublish" : "Publish"}</button><ProductProofEditor product={product} /></td></tr>)}</tbody></table></div></section></>}
			{section === "reservations" && (
				<>
					<div className="ad-report-tabs" role="tablist" aria-label={ui("reservation_reports", "Reservation reports")}>
						<button id="reservation-report-tab" type="button" role="tab" aria-selected={reservationTab === "reservations"} aria-controls="reservation-report-panel reservation-details-panel" className={reservationTab === "reservations" ? "is-active" : ""} onClick={() => setReservationTab("reservations")}>
							{ui("reservation_tab", "Reservations")} <span>{reservationProducts.reduce((total, product) => total + (product.reservationCount ?? 0), 0)}</span>
						</button>
						<button id="interest-report-tab" type="button" role="tab" aria-selected={reservationTab === "interests"} aria-controls="interest-report-panel" className={reservationTab === "interests" ? "is-active" : ""} onClick={() => setReservationTab("interests")}>
							{ui("interest_tab", "Interests")} <span>{interestProducts.reduce((total, product) => total + (product.interestCount ?? 0), 0)}</span>
						</button>
					</div>
					{reservationTab === "reservations" && <div id="reservation-report-panel" role="tabpanel" aria-labelledby="reservation-report-tab">
					<section className="ad-panel">
						<div className="ad-panel-heading">
							<div><span className="ad-eyebrow">RESERVE A SPOT · NO PAYMENT</span><h2>Reservations</h2><p>Each row is one product; its country counts are shown beside that product. Manage destinations in Products.</p></div>
							<span className="ad-count-pill">{reservationProducts.reduce((total, product) => total + (product.reservationCount ?? 0), 0)} reservations</span>
						</div>
						<div className="ad-table-wrap">
							<table className="ad-table"><thead><tr><th>PRODUCT</th><th>RESERVED</th><th>BY COUNTRY</th><th>STATUS</th><th>SETTINGS</th></tr></thead>
								<tbody>{reservationProducts.map((product) => <tr key={product.id}>
									<td><div className="ad-product-cell"><Image src={product.image} alt="" width={48} height={48} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td>
									<td><strong>{product.reservationCount ?? 0}</strong>{product.reservationTarget ? ` / ${product.reservationTarget}` : " · no target"}</td>
									<td className="ad-reservation-country-list">{product.reservationsByCountry?.length ? product.reservationsByCountry.map((entry) => <span key={entry.country}>{regionName(entry.country, language, entry.country)}: <strong>{entry.count}</strong></span>) : <small>No reservations yet</small>}</td>
									<td>
										<span className={`ad-status ${product.reservationsOpen ? "ad-status--published" : "ad-status--pending"}`}>{product.reservationsOpen ? "Open" : "Closed"}</span>
										{product.reservationMinimumReachedAt && <small>{t("admin.reservations.minimum_reached", "Minimum reached — review production")}</small>}
									</td>
									<td><ReservationSettingsEditor product={product} /></td>
								</tr>)}</tbody>
							</table>
							{!reservationProducts.length && <div className="ad-empty">No products are available for reservation setup.</div>}
						</div>
					</section>
					</div>}
					{reservationTab === "interests" && <div id="interest-report-panel" role="tabpanel" aria-labelledby="interest-report-tab">
					<section className="ad-panel">
						<div className="ad-panel-heading">
							<div><span className="ad-eyebrow">UNSHIPPED DEMAND</span><h2>Interests (separate from reservations)</h2><p>Each row is one product; country counts stay with that product. Interest requests never create a reservation.</p></div>
							<span className="ad-count-pill">{interestProducts.reduce((total, product) => total + (product.interestCount ?? 0), 0)} interests</span>
						</div>
						<div className="ad-table-wrap">
							<table className="ad-table"><thead><tr><th>PRODUCT</th><th>INTEREST</th><th>BY COUNTRY</th></tr></thead>
								<tbody>{interestProducts.map((product) => <tr key={product.id}>
									<td><div className="ad-product-cell"><Image src={product.image} alt="" width={48} height={48} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td>
									<td><strong>{product.interestCount ?? 0}</strong></td>
									<td className="ad-reservation-country-list">{product.interestsByCountry?.length ? product.interestsByCountry.map((entry) => <span key={entry.country}>{regionName(entry.country, language, entry.country)}: <strong>{entry.count}</strong></span>) : <small>No interests yet</small>}</td>
								</tr>)}</tbody>
							</table>
							{!interestProducts.length && <div className="ad-empty">{ui("no_interests", "No interest requests yet.")}</div>}
						</div>
					</section>
					</div>}
					{reservationTab === "reservations" && <div id="reservation-details-panel" role="tabpanel" aria-labelledby="reservation-report-tab">
					<section className="ad-panel ad-reservation-entries-panel">
						<div className="ad-panel-heading">
							<div><span className="ad-eyebrow">ADMIN-ONLY DETAILS · RESERVATIONS</span><h2>{t("admin.reservations.entries_title", "Individual reservations")}</h2><p>{t("admin.reservations.entries_note", "Reservation emails are visible only to signed-in admins and are included in filtered exports.")}</p></div>
							<span className="ad-count-pill">{reservationEntries.total} {t("admin.reservations.entries_count", "records")}</span>
						</div>
						<form className="ad-toolbar ad-reservation-entry-filters" onSubmit={(event) => { event.preventDefault(); void loadReservationEntries(0, reservationFilters); }}>
							<label><span>{t("admin.reservations.filter_product", "Product")}</span>
								<select value={reservationFilters.productId} onChange={(event) => setReservationFilters((current) => ({ ...current, productId: event.target.value }))}>
									<option value="">{t("admin.reservations.all_products", "All products")}</option>
									{reservationProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
								</select>
							</label>
							<label><span>{t("admin.reservations.filter_country", "Country")}</span>
								<select value={reservationFilters.country} onChange={(event) => setReservationFilters((current) => ({ ...current, country: event.target.value }))}>
									<option value="">{t("admin.reservations.all_countries", "All countries")}</option>
									{reservationCountryTotals.map((entry) => <option key={entry.country} value={entry.country}>{regionName(entry.country, language, entry.country)}</option>)}
								</select>
							</label>
							<label className="ad-search"><span>⌕</span><input value={reservationFilters.query} onChange={(event) => setReservationFilters((current) => ({ ...current, query: event.target.value }))} placeholder={t("admin.reservations.filter_search", "Search email or product")} maxLength={180} /></label>
							<button type="submit" disabled={reservationEntriesLoading}>{t("admin.reservations.apply_filters", "Apply filters")}</button>
							<button type="button" onClick={() => void exportReservationEntries()} disabled={reservationExporting || reservationEntriesLoading || reservationEntries.total === 0}>{reservationExporting ? t("admin.reservations.exporting", "Preparing Excel…") : t("admin.reservations.export", "Export filtered Excel")}</button>
						</form>
						<div className="ad-reservation-report" aria-label="Filtered reservation report summary">
							<article><small>FILTERED RESERVATIONS</small><strong>{reservationEntries.total}</strong><span>matching all applied filters</span></article>
							<article><small>ON THIS PAGE</small><strong>{reservationEntries.items.length}</strong><span>of up to {reservationEntries.limit} rows</span></article>
							<article><small>APPLIED FILTERS</small><strong>{appliedReservationFilters.productId || appliedReservationFilters.country || appliedReservationFilters.query ? "Customized" : "All reservations"}</strong><span>{[
								reservationProducts.find((product) => product.id === appliedReservationFilters.productId)?.name,
								appliedReservationFilters.country ? regionName(appliedReservationFilters.country, language, appliedReservationFilters.country) : undefined,
								appliedReservationFilters.query.trim() || undefined,
							].filter(Boolean).join(" · ") || "No filters applied"}</span></article>
						</div>
						<div className="ad-table-wrap">
							<table className="ad-table">
								<thead><tr><th>{t("admin.reservations.product", "PRODUCT")}</th><th>{t("admin.reservations.email", "EMAIL")}</th><th>{t("admin.reservations.country", "COUNTRY")}</th><th>{t("admin.reservations.created", "RESERVED AT")}</th></tr></thead>
								<tbody>{reservationEntries.items.map((entry) => <tr key={entry.id}>
									<td><strong>{entry.productName}</strong></td><td>{entry.email}</td><td>{regionName(entry.country, language, entry.country)}</td><td>{date(entry.createdAt)}</td>
								</tr>)}</tbody>
							</table>
							{reservationEntriesLoading && <div className="ad-empty" role="status">{t("admin.reservations.loading", "Loading reservations…")}</div>}
							{!reservationEntriesLoading && !reservationEntries.items.length && <div className="ad-empty">{t("admin.reservations.empty", "No reservations match these filters.")}</div>}
						</div>
						<footer className="ad-reservation-entry-pagination">
							<span>{t("admin.reservations.pagination", "Showing {{from}}–{{to}} of {{total}}", {
								from: reservationEntries.total ? reservationEntries.offset + 1 : 0,
								to: Math.min(reservationEntries.offset + reservationEntries.limit, reservationEntries.total),
								total: reservationEntries.total,
							})}</span>
							<div>
								<button type="button" onClick={() => void loadReservationEntries(Math.max(0, reservationEntries.offset - reservationEntries.limit))} disabled={reservationEntries.offset === 0 || reservationEntriesLoading}>{t("admin.reservations.previous", "Previous")}</button>
								<button type="button" onClick={() => void loadReservationEntries(reservationEntries.offset + reservationEntries.limit)} disabled={reservationEntries.offset + reservationEntries.limit >= reservationEntries.total || reservationEntriesLoading}>{t("admin.reservations.next", "Next")}</button>
							</div>
						</footer>
					</section>
					</div>}
				</>
			)}
			{section === "email-inbox" && <section className="ad-panel ad-email-inbox">
				<div className="ad-panel-heading">
					<div><span className="ad-eyebrow">{ui("email_center_eyebrow", "CUSTOMER CARE")}</span><h2>{ui("email_center_title", "Email & messages")}</h2><p>{ui("email_center_note", "Storefront contact and maker messages, plus mail synced from your IMAP inbox.")}</p></div>
					<div className="ad-email-heading-actions">
						<span className={`ad-status ${emailInboxStatus?.imapConfigured ? "ad-status--published" : "ad-status--pending"}`}>{ui("email_imap_progress", "IMAP configured: {{configured}} / {{total}} mailboxes", { configured: emailInboxStatus?.mailboxes.filter((mailbox) => mailbox.imapConfigured).length ?? 0, total: emailInboxStatus?.mailboxes.length ?? 3 })}</span>
						<button type="button" onClick={() => void syncEmailInbox()} disabled={busyId === "email-sync"}>{busyId === "email-sync" ? ui("email_syncing", "Syncing…") : ui("email_sync", "Sync inbox")}</button>
					</div>
				</div>
				{emailInboxStatus?.mailboxes.some((mailbox) => !mailbox.imapConfigured || !mailbox.smtpConfigured) && <aside className="ad-email-config-note" role="note">
					<strong>{ui("email_setup_title", "Mailbox setup")}</strong>
					<p>{ui("email_account_setup_note", "Add the password for each address in backend/.env.local, then restart the API. A mailbox must have both IMAP and SMTP configured before its messages sync and can be replied to.")}</p>
				</aside>}
				<div className="ad-email-mailbox-status" aria-label={ui("email_mailbox_status", "Mailbox connection status")}>
					{emailInboxStatus?.mailboxes.map((mailbox) => <article key={mailbox.key}>
						<strong>{mailbox.address || mailbox.key}</strong>
						<span className={mailbox.imapConfigured ? "is-ready" : ""}>{ui("email_status_imap", "IMAP")}: {mailbox.imapConfigured ? ui("email_configured", "Configured") : ui("email_not_configured", "Not configured")}</span>
						<span className={mailbox.smtpConfigured ? "is-ready" : ""}>{ui("email_status_smtp", "SMTP")}: {mailbox.smtpConfigured ? ui("email_configured", "Configured") : ui("email_not_configured", "Not configured")}</span>
						{mailbox.lastSyncedAt && <small>{ui("email_last_synced", "Last synced {{date}}", { date: date(mailbox.lastSyncedAt) })}</small>}
						{mailbox.lastError && <small role="status">{ui("email_last_sync_error", "Last mailbox sync failed: {{error}}", { error: mailbox.lastError })}</small>}
					</article>)}
				</div>
				<p className="ad-email-status-note">{ui("email_status_note", "Configured means settings are present; it does not confirm a live connection or successful delivery. Actual reply status appears in each conversation.")}</p>
				<div className="ad-email-mailbox-tabs" role="tablist" aria-label={ui("email_mailbox_tabs", "Mailboxes")}>
					{emailInboxStatus?.mailboxes.map((mailbox) => {
						const count = emailInboxSummary?.byMailbox[mailbox.key];
						return <button key={mailbox.key} type="button" role="tab" aria-selected={emailMailboxKey === mailbox.key} className={emailMailboxKey === mailbox.key ? "is-active" : ""} onClick={() => {
							setEmailMailboxKey(mailbox.key);
							void loadEmailThreads(emailQuery, mailbox.key, emailStatusFilter);
						}}>
							<strong>{mailbox.address || mailbox.key}</strong>
							<span>{ui("email_thread_count", "{{count}} conversations", { count: count?.total ?? 0 })}</span>
						</button>;
					})}
					{(emailInboxSummary?.byMailbox.other?.total ?? 0) > 0 && <button type="button" role="tab" aria-selected={emailMailboxKey === "other"} className={emailMailboxKey === "other" ? "is-active" : ""} onClick={() => {
						setEmailMailboxKey("other");
						void loadEmailThreads(emailQuery, "other", emailStatusFilter);
					}}>
						<strong>{ui("email_other_mailbox", "Other messages")}</strong>
						<span>{ui("email_thread_count", "{{count}} conversations", { count: emailInboxSummary?.byMailbox.other.total ?? 0 })}</span>
					</button>}
				</div>
				<div className="ad-email-toolbar">
					<form onSubmit={(event) => { event.preventDefault(); void loadEmailThreads(); }}>
						<label className="ad-search"><span>⌕</span><input aria-label={ui("email_search", "Search inbox")} value={emailQuery} maxLength={180} onChange={(event) => setEmailQuery(event.target.value)} placeholder={ui("email_search_placeholder", "Search sender, subject or message")} /></label>
						<button type="submit">{ui("email_search", "Search inbox")}</button>
					</form>
					<span>{ui("email_thread_count", "{{count}} conversations", { count: emailThreadTotal })}</span>
				</div>
				<div className="ad-email-filters" role="group" aria-label={ui("email_status_filters", "Filter conversations")}>
					{emailFilterOptions.map((filter) => <button key={filter.key} type="button" className={emailStatusFilter === filter.key ? "is-active" : ""} aria-pressed={emailStatusFilter === filter.key} onClick={() => {
						setEmailStatusFilter(filter.key);
						void loadEmailThreads(emailQuery, emailMailboxKey, filter.key);
					}}>
						<span>{filter.label}</span><b>{filter.count}</b>
					</button>)}
				</div>
				<div className="ad-email-workspace">
					<div className="ad-email-threads" aria-label={ui("email_conversations", "Conversations")}>
						{emailThreads.map((thread) => <button
							className={`ad-email-thread ${emailThreadKey === thread.threadKey ? "is-selected" : ""}`}
							type="button"
							key={thread.threadKey}
							aria-pressed={emailThreadKey === thread.threadKey}
							onClick={() => void openEmailThread(thread.threadKey)}
						>
							<span className="ad-email-thread-top"><strong>{thread.fromName || thread.fromEmail}</strong><time dateTime={thread.latestAt}>{date(thread.latestAt)}</time></span>
							<span className="ad-email-thread-address">{thread.fromEmail}</span>
							<strong className="ad-email-thread-subject">{thread.subject}</strong>
							<span className="ad-email-thread-preview">{thread.preview || ui("email_no_preview", "No text preview available.")}</span>
							<span className="ad-email-thread-meta"><span>{ui(`email_source_${thread.source}`, thread.source.replaceAll("_", " "))}</span><small>{ui(`email_reply_status_${thread.replyStatus}`, thread.replyStatus.replaceAll("_", " "))}</small>{thread.unreadCount > 0 && <b>{ui("email_unread", "{{count}} unread", { count: thread.unreadCount })}</b>}</span>
						</button>)}
						{!emailThreads.length && <div className="ad-empty">{ui("email_empty", "No conversations found.")}</div>}
					</div>
					<section className="ad-email-conversation" aria-label={ui("email_conversation", "Email conversation")}>
						{emailThreadLoading && <div className="ad-empty" role="status">{ui("email_loading_thread", "Loading conversation…")}</div>}
						{!emailThreadLoading && emailThread && <div className="ad-email-conversation-inner">
							<header className="ad-email-conversation-header"><div><span className="ad-eyebrow">{ui("email_conversation", "CONVERSATION")}</span><h3>{emailThread.subject}</h3><p>{emailThread.messages.find((message) => message.direction === "inbound")?.fromEmail}</p></div><span className="ad-count-pill">{ui("email_messages_count", "{{count}} messages", { count: emailThread.messages.length })}</span></header>
							<div className="ad-email-messages">{emailThread.messages.map((message) => <article className={`ad-email-message ${message.direction === "outbound" ? "is-outbound" : ""}`} key={message.id}>
								<div className="ad-email-message-heading"><strong>{message.direction === "outbound" ? ui("email_from_ponyo", "Ponyo") : message.fromName || message.fromEmail}</strong><time dateTime={message.receivedAt}>{date(message.receivedAt)}</time></div>
								{message.direction === "outbound" && <small className="ad-email-delivery-status">{ui(`email_delivery_${message.deliveryStatus}`, message.deliveryStatus)}</small>}
								<p className="ad-email-message-body">{message.body || ui("email_no_body", "No message text was provided.")}</p>
							</article>)}</div>
							<form className="ad-email-reply-form" onSubmit={(event) => void sendEmailReply(event)}>
								<div className="ad-email-reply-heading"><h4>{ui("email_reply_title", "Reply")}</h4><label>{ui("email_template", "Reply template")}<select value={emailReplyTemplate} onChange={(event) => { const selected = emailReplyTemplates.find((template) => template.id === event.target.value); setEmailReplyTemplate(event.target.value); if (selected) setEmailReplyBody(selected.body); }}><option value="">{ui("email_template_custom", "Write a reply")}</option>{emailReplyTemplates.map((template) => <option value={template.id} key={template.id}>{template.label}</option>)}</select></label></div>
								{emailThread.replyFrom && <p className="ad-email-reply-from">{ui("email_replying_from", "Replying from {{email}}", { email: emailThread.replyFrom })}</p>}
								<label className="ad-email-reply-label" htmlFor="admin-email-reply">{ui("email_reply_body", "Message")}</label>
								<textarea id="admin-email-reply" value={emailReplyBody} onChange={(event) => setEmailReplyBody(event.target.value)} maxLength={5000} rows={6} required disabled={!emailThread.replyConfigured} placeholder={emailThread.replyConfigured ? ui("email_reply_placeholder", "Write your reply. Templates can be edited before sending.") : ui("email_reply_unavailable", "Configure this address's IMAP and SMTP password to reply.")} />
								<div className="ad-email-reply-footer"><span>{emailThread.messages.find((message) => message.direction === "inbound")?.fromEmail}</span><button className="ad-primary-button" type="submit" disabled={!emailThread.replyConfigured || !emailReplyBody.trim() || busyId === "email-reply"}>{busyId === "email-reply" ? ui("email_sending", "Queueing…") : ui("email_send_reply", "Send reply")}<span>↗</span></button></div>
							</form>
						</div>}
						{!emailThreadLoading && !emailThread && <div className="ad-empty">{ui("email_select_conversation", "Select a conversation to view and reply.")}</div>}
					</section>
				</div>
			</section>}
			{section === "maker-applications" && <section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">INDEPENDENT MAKERS</span><h2>Applications to review</h2><p>Private applicant details are visible only in this admin workspace.</p></div><span className="ad-count-pill">{makerApplications.length} applications</span></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>MAKER</th><th>CONTACT</th><th>PRODUCT</th><th>APPLICATION DETAILS</th><th>STATUS</th></tr></thead><tbody>{makerApplications.map((application) => <tr key={application.id}><td><strong>{application.makerName}</strong><small>{application.country} · {application.city}</small><small>{date(application.createdAt)}</small></td><td><strong>{application.contactPerson}</strong><a href={`mailto:${application.email}`}>{application.email}</a>{application.website && <a href={application.website} target="_blank" rel="noreferrer noopener">Website ↗</a>}{application.socialMedia && <a href={application.socialMedia} target="_blank" rel="noreferrer noopener">Social ↗</a>}</td><td><a href={application.productUrl} target="_blank" rel="noreferrer noopener">{application.productUrl} ↗</a><small>{application.priceRange}</small></td><td><details className="ad-application-details"><summary>Materials, evidence &amp; photos</summary><p>{application.productDescription}</p><p><strong>Demand evidence:</strong> {application.provenDesireEvidence}</p><p><strong>Materials:</strong> {application.materials}</p><p><strong>Ponyo exclusivity:</strong> {application.ponyoExclusivity}</p><div className="maker-photo-preview">{application.productPhotos.map((photo, index) => <span key={index}><Image src={photo} alt={`${application.makerName} product example ${index + 1}`} width={100} height={100} unoptimized /></span>)}</div></details></td><td><select aria-label={`Application status for ${application.makerName}`} value={application.status} disabled={busyId === application.id} onChange={(event) => void updateMakerApplication(application, event.target.value as MakerApplicationStatus)}><option value="pending">Pending</option><option value="reviewing">Reviewing</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></td></tr>)}</tbody></table>{!makerApplications.length && <div className="ad-empty">No maker applications have been submitted.</div>}</div></section>}
			{section === "suppliers" && <section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">PARTNER DIRECTORY</span><h2>Supplier relationships</h2></div><span className="ad-count-pill">{suppliers.length} suppliers</span></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>SUPPLIER</th><th>CODE</th><th>ACCOUNTS</th><th>APPROVED OFFERS</th><th>TYPE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong><small>{supplier.contactEmail ?? "No contact email"}</small></td><td>{supplier.code}</td><td>{supplier.accountCount}</td><td>{supplier.offerCount}</td><td>{supplier.isDemo ? "Demo" : "Partner"}</td><td><span className={`ad-status ${supplier.active ? "ad-status--published" : "ad-status--pending"}`}>{supplier.active ? "Active" : "Paused"}</span></td><td><button className="ad-row-action" type="button" disabled={busyId === supplier.id} onClick={() => void toggleSupplier(supplier)}>{supplier.active ? "Pause" : "Activate"}</button></td></tr>)}</tbody></table></div></section>}
			{section === "customers" && <><div className="ad-toolbar"><label className="ad-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSection("customers", query); }} placeholder="Customer name or email" /></label><button type="button" onClick={() => void loadSection("customers")}>Search customers</button></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>CUSTOMER</th><th>EMAIL</th><th>VERIFICATION</th><th>JOINED</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.firstName} {customer.lastName}</strong></td><td>{customer.email}</td><td><span className={`ad-status ${customer.emailVerified ? "ad-status--published" : "ad-status--pending"}`}>{customer.emailVerified ? "Verified" : "Pending"}</span></td><td>{date(customer.createdAt)}</td></tr>)}</tbody></table></div></section></>}
			{section === "admin-accounts" && <>
				<section className="ad-panel ad-admin-account-panel">
					<div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("admin_accounts_hint", "Manage operations access")}</span><h2>{ui("admin_account_form_title", "Create an admin account")}</h2><p>{ui("admin_account_form_note", "Only current admins can provision access. Share the temporary password securely with the new admin.")}</p></div></div>
					<form className="ad-admin-account-form" onSubmit={createAdminAccount}>
						<label>{ui("first_name", "First name")}<input value={newAdmin.firstName} onChange={(event) => setNewAdmin((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" maxLength={120} required /></label>
						<label>{ui("last_name", "Last name")}<input value={newAdmin.lastName} onChange={(event) => setNewAdmin((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" maxLength={120} /></label>
						<label>{ui("email", "Email")}<input type="email" value={newAdmin.email} onChange={(event) => setNewAdmin((current) => ({ ...current, email: event.target.value }))} autoComplete="email" maxLength={320} required /></label>
						<label>{ui("temporary_password", "Temporary password")}<input type="password" value={newAdmin.password} onChange={(event) => setNewAdmin((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" minLength={8} maxLength={128} required /><small>{ui("temporary_password_requirements", "At least 8 characters, including a number and a special character.")}</small></label>
						<button className="ad-primary-button" type="submit" disabled={busyId === "create-admin"}>{busyId === "create-admin" ? ui("creating", "Creating…") : ui("create_admin_access", "Create admin access")}<span>↗</span></button>
					</form>
				</section>
				<section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">{ui("current_admins", "CURRENT ADMINS")}</span><h2>{ui("admin_accounts_title", "Admin accounts")}</h2></div><span className="ad-count-pill">{ui("admin_count", "{{count}} accounts", { count: adminAccounts.length })}</span></div>
					<div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>{ui("admin_table_name", "ADMIN")}</th><th>{ui("admin_table_email", "EMAIL")}</th><th>{ui("admin_table_access", "ACCESS")}</th><th>{ui("admin_table_created", "CREATED")}</th><th>{ui("admin_table_actions", "ACTIONS")}</th></tr></thead><tbody>{adminAccounts.map((account) => {
						const revokeDisabled = account.id === admin?.id || adminAccounts.length <= 1;
						return <tr key={account.id}>
							<td><strong>{account.firstName} {account.lastName}</strong></td>
							<td>{account.email}</td>
							<td><span className={`ad-status ${account.emailVerified ? "ad-status--published" : "ad-status--pending"}`}>{account.emailVerified ? ui("verified_admin", "Verified admin") : ui("admin_email_unverified", "Email not verified")}</span></td>
							<td>{date(account.createdAt)}</td>
							<td><div className="ad-admin-account-actions">
								<button className="ad-row-action" type="button" disabled={busyId === account.id} onClick={() => startAdminAccountEdit(account)}>{ui("edit_admin_account", "Edit")}</button>
								<button className="ad-row-action ad-row-action--danger" type="button" disabled={busyId === account.id || revokeDisabled} title={revokeDisabled ? ui("admin_access_protected_hint", "You cannot revoke your own or the last admin account.") : undefined} onClick={() => void revokeAdminAccount(account)}>{ui("revoke_admin_access", "Revoke access")}</button>
							</div>{revokeDisabled && <small>{ui("admin_access_protected_hint", "You cannot revoke your own or the last admin account.")}</small>}</td>
						</tr>;
					})}</tbody></table>{!adminAccounts.length && <div className="ad-empty">{ui("no_admin_accounts", "No admin accounts were returned.")}</div>}</div>
					{editingAdmin && <form className="ad-admin-account-form ad-admin-account-edit-form" onSubmit={saveAdminAccount}>
						<div className="ad-admin-account-edit-heading"><h3>{ui("admin_edit_title", "Edit admin account")}</h3><button className="ad-row-action" type="button" onClick={() => setEditingAdmin(null)}>{ui("cancel_admin_edit", "Cancel")}</button></div>
						<label>{ui("first_name", "First name")}<input value={editingAdmin.firstName} onChange={(event) => setEditingAdmin((current) => current ? { ...current, firstName: event.target.value } : current)} autoComplete="given-name" maxLength={120} required /></label>
						<label>{ui("last_name", "Last name")}<input value={editingAdmin.lastName} onChange={(event) => setEditingAdmin((current) => current ? { ...current, lastName: event.target.value } : current)} autoComplete="family-name" maxLength={120} /></label>
						<label>{ui("email", "Email")}<input type="email" value={editingAdmin.email} onChange={(event) => setEditingAdmin((current) => current ? { ...current, email: event.target.value } : current)} autoComplete="email" maxLength={320} required /></label>
						<label>{ui("new_admin_password", "New password (optional)")}<input type="password" value={editingAdmin.password} onChange={(event) => setEditingAdmin((current) => current ? { ...current, password: event.target.value } : current)} autoComplete="new-password" minLength={8} maxLength={128} /><small>{ui("new_admin_password_hint", "Leave blank to keep the current password. A new password needs at least 8 characters, a number, and a special character.")}</small></label>
						<button className="ad-primary-button" type="submit" disabled={busyId === editingAdmin.id}>{busyId === editingAdmin.id ? ui("saving_admin_changes", "Saving…") : ui("save_admin_changes", "Save changes")}<span>↗</span></button>
					</form>}
				</section>
			</>}
			{section === "fulfillment" && <><div className="ad-fulfillment-summary"><strong>{metrics?.ordersAwaitingFulfillment ?? 0}</strong><span>paid orders awaiting fulfillment action</span><p>Customer orders may split across suppliers. Select an order to inspect supplier confirmations and shipment tracking.</p></div><section className="ad-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>FULFILLMENT</th><th>SUPPLIER ROUTING</th><th>TOTAL</th><th>ACTION</th></tr></thead><tbody>{orders.items.map((order) => <tr key={order.id} className={selectedOrderId === order.id ? "is-selected" : ""} onClick={() => { setSelectedOrderId(order.id); setOrderDetail(null); }}><td><strong>{order.orderNumber}</strong><small>{date(order.createdAt)}</small></td><td>{order.customerEmail}</td><td>{order.fulfillmentStatus.replaceAll("_", " ")}</td><td>{order.supplierFulfillmentStatus.replaceAll("_", " ")}</td><td>{amount(order.totalAmount, order.currency, formatPrice)}</td><td><button className="ad-row-action" type="button" disabled={busyId === order.id || order.paymentStatus !== "paid"} onClick={(event) => { event.stopPropagation(); void planSupplierOrders(order); }}>{busyId === order.id ? "Planning…" : "Plan suppliers"}</button></td></tr>)}</tbody></table>{!orders.items.length && <div className="ad-empty">No paid orders need fulfillment right now.</div>}</div></section>{orderDetail && <section className="ad-panel ad-order-detail"><div className="ad-panel-heading"><div><span className="ad-eyebrow">ORDER DETAIL</span><h2>{orderDetail.orderNumber}</h2></div><button type="button" onClick={() => setOrderDetail(null)}>Close</button></div><div className="ad-detail-columns"><section><h3>Supplier purchase orders</h3>{orderDetail.supplierFulfillments.map((po) => <article key={po.purchaseOrderId}><span><strong>{po.purchaseOrderNumber} · {po.supplier}</strong><small>{po.status.replaceAll("_", " ")}</small></span><small>{po.items.length} lines</small></article>)}{!orderDetail.supplierFulfillments.length && <p className="ad-detail-empty">No supplier PO has been planned yet.</p>}</section><section><h3>Shipments &amp; tracking</h3>{orderDetail.shipments.map((shipment) => <article key={shipment.id}><span><strong>{shipment.number} · {shipment.carrier}</strong><small>{shipment.status.replaceAll("_", " ")} · {shipment.trackingNumber}</small></span>{shipment.trackingUrl && <a href={shipment.trackingUrl} target="_blank" rel="noreferrer">Track ↗</a>}</article>)}{!orderDetail.shipments.length && <p className="ad-detail-empty">No shipment records yet.</p>}</section></div></section>}</>}
			{section === "brands" && <section className="ad-panel"><div className="ad-panel-heading"><div><span className="ad-eyebrow">CURATED PARTNERS</span><h2>Maker profile studio</h2></div><span className="ad-count-pill">{brands.length} profiles</span></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>MAKER</th><th>SLUG</th><th>CATALOG PRODUCTS</th><th>RECORD TYPE</th><th>PROFILE</th></tr></thead><tbody>{brands.map((brand) => <tr key={brand.id}><td><strong>{brand.name}</strong></td><td>{brand.slug}</td><td>{brand.productCount}</td><td>{brand.isDemo ? "Demo seed" : "Curated catalog"}</td><td>{brand.isDemo ? <small>Demo records are not shown as maker profiles.</small> : <BrandProfileEditor brand={brand} />}</td></tr>)}</tbody></table>{!brands.length && <div className="ad-empty">No maker profiles exist yet.</div>}</div><p className="ad-brand-note">Publish only maker stories, images, materials, and process details confirmed by the maker.</p></section>}
			<footer className="ad-footer">A softer marketplace, run with care <span>♡</span><Link href="/pages/contact">Need a hand? Contact Ponyo</Link></footer>
		</section>
	</main>;
}
