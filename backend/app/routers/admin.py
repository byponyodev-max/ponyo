"""Admin-only marketplace operations and read models for the Ponyo dashboard."""

import csv
import hashlib
import logging
import re
from datetime import date, datetime, timedelta, timezone
from io import BytesIO, StringIO
from uuid import UUID, uuid4

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import String, case, cast, func, literal, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.catalog_stock import sellable_variant
from app.db import get_db
from app.email_queue import enqueue_email_notification
from app.mailbox_sync import (
    mailbox_message_id,
    mailbox_sync_state_key,
    sync_mailbox_once,
    sync_portal_messages,
)
from app.product_categories import PRODUCT_CATEGORY_SLUGS
from app.newsletter import unsubscribe_url
from app.models import (
    Brand,
    ContactRequest,
    Customer,
    EmailNotification,
    EmailInboxMessage,
    EmailInboxSyncState,
    MakerApplication,
    NewsletterSubscription,
    Order,
    OrderItem,
    OutboxEvent,
    Product,
    ProductCategory,
    ProductInterest,
    ProductReservation,
    ProductVariant,
    ProductWaitlistEntry,
    Shipment,
    Supplier,
    SupplierAccount,
    SupplierInventory,
    SupplierOfferChangeRequest,
    SupplierOffer,
    SupplierPurchaseOrder,
    SupplierPurchaseOrderItem,
    utc_now,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import (
    AdminAccountCreateRequest,
    AdminAccountUpdateRequest,
    AdminBrandProfileRequest,
    AdminEmailReplyRequest,
    AdminEmailThreadArchiveRequest,
    AdminMakerApplicationStatusRequest,
    AdminNewsletterCampaignRequest,
    AdminProductCategoryRequest,
    AdminProductProofRequest,
    AdminProductPublicationRequest,
    AdminProductReservationSettings,
    AdminProductProductionApprovalRequest,
    AdminSupplierOfferChangeDecision,
    AdminSupplierStatusRequest,
)
from app.security import hash_password, require_csrf, require_roles
from app.translations import TranslationUnavailableError, ensure_product_translations
from app.inventory import refresh_synced_variant
from app.maker_application_storage import MakerPhotoStorageError, signed_maker_application_photo_url
from app.supplier_pricing import retail_price_for_wholesale_cost

router = APIRouter(prefix="/admin", tags=["admin marketplace operations"])

MAX_RESERVATION_EXPORT_ROWS = 10_000
MESSAGE_ID_PATTERN = re.compile(r"<[^<>\s]+>")
logger = logging.getLogger("ponyo.admin")


def reservation_filters(product_id: UUID | None, country: str | None, q: str | None):
    filters = []
    if product_id is not None:
        filters.append(ProductReservation.product_id == product_id)
    if country and country.strip():
        filters.append(ProductReservation.country.ilike(country.strip()))
    if q and q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        filters.append(or_(
            ProductReservation.email.ilike(pattern, escape="\\"),
            Product.name.ilike(pattern, escape="\\"),
        ))
    return filters


def safe_csv_cell(value: str) -> str:
    if value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value


def reply_mailbox_for(settings, message: EmailInboxMessage):
    accounts = settings.email_inbox_accounts
    mailbox_key = message.mailbox_name
    if message.source_type == "imap" and mailbox_key in accounts:
        mailbox = accounts[mailbox_key]
        return (mailbox_key, mailbox) if mailbox.smtp_configured else (None, None)
    if mailbox_key in accounts and accounts[mailbox_key].smtp_configured:
        return mailbox_key, accounts[mailbox_key]

    recipient = message.to_email.strip().casefold()
    if recipient:
        for key, mailbox in accounts.items():
            if mailbox.smtp_configured and recipient in {
                mailbox.address.strip().casefold(),
                mailbox.from_email.strip().casefold(),
            }:
                return key, mailbox

    if message.source_type == "imap":
        return None, None
    configured = [(key, mailbox) for key, mailbox in accounts.items() if mailbox.smtp_configured]
    return configured[0] if len(configured) == 1 else (None, None)


def email_mailbox_key(settings, message: EmailInboxMessage) -> str:
    accounts = settings.email_inbox_accounts
    if message.mailbox_name in accounts:
        return message.mailbox_name
    recipient = message.to_email.strip().casefold()
    if recipient:
        for key, mailbox in accounts.items():
            if recipient in {
                mailbox.address.strip().casefold(),
                mailbox.from_email.strip().casefold(),
                mailbox.username.strip().casefold(),
            }:
                return key
    return "other"


async def reservation_export_data(db: AsyncSession, filters):
    total = await db.scalar(
        select(func.count(ProductReservation.id))
        .join(Product, Product.id == ProductReservation.product_id)
        .where(*filters)
    ) or 0
    if total > MAX_RESERVATION_EXPORT_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"Export is limited to {MAX_RESERVATION_EXPORT_ROWS} rows. Narrow the filters and try again.",
        )
    rows = (await db.execute(
        select(
            ProductReservation.id,
            Product.name,
            ProductReservation.email,
            ProductReservation.country,
            ProductReservation.created_at,
        )
        .join(Product, Product.id == ProductReservation.product_id)
        .where(*filters)
        .order_by(ProductReservation.created_at.desc(), ProductReservation.id.desc())
    )).all()
    return total, rows


def reservation_workbook(rows, filters: dict[str, str | None]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Reservations"
    sheet.sheet_view.showGridLines = False
    sheet.freeze_panes = "A7"
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = "landscape"
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0

    sheet.merge_cells("A1:E1")
    title = sheet["A1"]
    title.value = "Ponyo · Reservation report"
    title.fill = PatternFill("solid", fgColor="49372F")
    title.font = Font(name="Aptos Display", size=18, bold=True, color="FFFFFF")
    title.alignment = Alignment(vertical="center")
    sheet.row_dimensions[1].height = 34

    generated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    sheet["A2"] = "Generated (UTC)"
    sheet["B2"] = generated_at
    sheet["B2"].number_format = "yyyy-mm-dd hh:mm"
    filter_labels = [
        f"Product ID: {filters['product_id']}" if filters.get("product_id") else None,
        f"Country: {filters['country']}" if filters.get("country") else None,
        f"Search: {filters['q']}" if filters.get("q") else None,
    ]
    sheet.merge_cells("A3:E3")
    sheet["A3"] = "Filters: " + " · ".join(safe_csv_cell(label) for label in filter_labels if label) if any(filter_labels) else "Filters: All reservations"
    sheet["A3"].font = Font(italic=True, color="75655C")
    sheet.merge_cells("A4:E4")
    sheet["A4"] = f"{len(rows)} reservation records"
    sheet["A4"].font = Font(bold=True, color="8D5F45")

    headers = ("Reservation ID", "Product", "Email", "Country", "Reserved at (UTC)")
    for column, header in enumerate(headers, start=1):
        cell = sheet.cell(row=6, column=column, value=header)
        cell.fill = PatternFill("solid", fgColor="9A7159")
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(vertical="center")
    sheet.row_dimensions[6].height = 24

    bottom_border = Border(bottom=Side(style="hair", color="E9DED6"))
    for row_index, (reservation_id, product_name, email, country, created_at) in enumerate(rows, start=7):
        date_value = created_at.astimezone(timezone.utc).replace(tzinfo=None) if created_at.tzinfo else created_at
        values = (
            safe_csv_cell(str(reservation_id)),
            safe_csv_cell(product_name),
            safe_csv_cell(email),
            safe_csv_cell(country),
            date_value,
        )
        for column, value in enumerate(values, start=1):
            cell = sheet.cell(row=row_index, column=column, value=value)
            cell.alignment = Alignment(vertical="center")
            cell.border = bottom_border
            if row_index % 2:
                cell.fill = PatternFill("solid", fgColor="FBF7F2")
        sheet.cell(row=row_index, column=5).number_format = "yyyy-mm-dd hh:mm"

    sheet.auto_filter.ref = f"A6:E{max(6, 6 + len(rows))}"
    for column, width in {"A": 40, "B": 34, "C": 34, "D": 20, "E": 25}.items():
        sheet.column_dimensions[column].width = width

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def order_summary(order: Order) -> dict:
    return {
        "id": str(order.id),
        "orderNumber": order.order_number,
        "createdAt": order.created_at.isoformat(),
        "status": order.status,
        "paymentStatus": order.payment_status,
        "fulfillmentStatus": order.fulfillment_status,
        "supplierFulfillmentStatus": order.supplier_fulfillment_status,
        "customerEmail": order.customer_email,
        "totalAmount": order.total_amount,
        "currency": order.currency,
        "itemsCount": sum(item.quantity for item in order.items),
        "shipmentCount": len(order.shipments),
        "deliveryAddress": order.shipping_address,
    }


def product_summary(product: Product) -> dict:
    variants = [variant for variant in product.variants if variant.active]
    return {
        "id": str(product.id),
        "sku": product.sku,
        "slug": product.slug,
        "name": product.name,
        "description": product.description,
        "priceAmount": product.price_amount,
        "currency": product.currency,
        "categoryName": product.category.name if product.category else product.category_name,
        "categoryId": str(product.category_id) if product.category_id else None,
        "categorySlug": product.category.slug if product.category else None,
        "brandName": product.brand.name if product.brand else product.supplier_name,
        "published": product.published,
        "createdAt": product.created_at.isoformat(),
        "image": product.images[0].url if product.images else product.image_url,
        "variantCount": len(variants),
        "stockQuantity": sum(max(0, variant.stock_quantity) for variant in variants),
        "availability": "available" if any(variant.stock_quantity > 0 for variant in variants) else "unavailable",
        "materials": product.materials,
        "weightGrams": product.weight_grams,
        "editionCount": product.edition_count,
        "estimatedDeliveryDate": product.estimated_delivery_date.isoformat() if product.estimated_delivery_date else None,
        "onlyAtPonyo": product.only_at_ponyo,
        "reservationsOpen": product.reservations_open,
        "reservationTarget": product.reservation_target,
        "reservationDeadline": product.reservation_deadline.isoformat() if product.reservation_deadline else None,
        "productionStatus": product.production_status,
        "productionApprovedAt": product.production_approved_at.isoformat() if product.production_approved_at else None,
        "preorderInvitesSentAt": product.preorder_invites_sent_at.isoformat() if product.preorder_invites_sent_at else None,
        "reservationTargetMissedAt": product.reservation_target_missed_at.isoformat() if product.reservation_target_missed_at else None,
        "shippingCountries": product.shipping_countries,
    }


async def order_query(db: AsyncSession, order_id: UUID) -> Order | None:
    return await db.scalar(
        select(Order).where(Order.id == order_id)
        .options(
            selectinload(Order.items),
            selectinload(Order.shipments).selectinload(Shipment.items),
            selectinload(Order.shipments).selectinload(Shipment.events),
        )
    )


@router.get("/dashboard", response_model=dict)
async def dashboard(_admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    recent_since = utc_now() - timedelta(days=7)
    order_count = await db.scalar(select(func.count()).select_from(Order)) or 0
    paid_count = await db.scalar(select(func.count()).select_from(Order).where(Order.payment_status == "paid")) or 0
    active_suppliers = await db.scalar(select(func.count()).select_from(Supplier).where(Supplier.active.is_(True))) or 0
    active_products = await db.scalar(select(func.count()).select_from(Product).where(Product.published.is_(True))) or 0
    pending_products = await db.scalar(select(func.count()).select_from(Product).where(Product.published.is_(False))) or 0
    pending_orders = await db.scalar(select(func.count()).select_from(Order).where(Order.status == "pending_payment")) or 0
    awaiting_fulfillment = await db.scalar(select(func.count()).select_from(Order).where(
        Order.payment_status == "paid", Order.fulfillment_status.in_(["unfulfilled", "queued", "on_hold", "supplier_confirmed"]),
    )) or 0
    low_stock = await db.scalar(select(func.count()).select_from(ProductVariant).join(Product).where(
        Product.published.is_(True), ProductVariant.active.is_(True), ProductVariant.stock_quantity <= 3,
    )) or 0
    customer_count = await db.scalar(select(func.count()).select_from(Customer).where(Customer.role == "customer")) or 0
    brand_count = await db.scalar(select(func.count()).select_from(Brand)) or 0
    unread_email_threads = await db.scalar(
        select(func.count(func.distinct(EmailInboxMessage.thread_key))).where(
            EmailInboxMessage.direction == "inbound",
            EmailInboxMessage.is_read.is_(False),
            EmailInboxMessage.archived_at.is_(None),
        )
    ) or 0
    open_contact_requests = await db.scalar(
        select(func.count()).select_from(ContactRequest).where(ContactRequest.status == "received")
    ) or 0
    applications_to_review = await db.scalar(
        select(func.count()).select_from(MakerApplication).where(MakerApplication.status.in_(("pending", "reviewing")))
    ) or 0
    new_suppliers = await db.scalar(
        select(func.count()).select_from(Supplier).where(
            Supplier.is_demo.is_(False),
            Supplier.created_at >= recent_since,
        )
    ) or 0
    new_customers = await db.scalar(
        select(func.count()).select_from(Customer).where(
            Customer.role == "customer",
            Customer.created_at >= recent_since,
        )
    ) or 0
    new_reservations = await db.scalar(
        select(func.count()).select_from(ProductReservation).where(ProductReservation.created_at >= recent_since)
    ) or 0
    new_interests = await db.scalar(
        select(func.count()).select_from(ProductInterest).where(ProductInterest.created_at >= recent_since)
    ) or 0
    new_waitlist_signups = await db.scalar(
        select(func.count()).select_from(ProductWaitlistEntry).where(
            ProductWaitlistEntry.created_at >= recent_since
        )
    ) or 0
    order_statuses = (await db.execute(select(Order.status, func.count()).group_by(Order.status))).all()
    revenue_rows = (await db.execute(select(Order.currency, func.sum(Order.captured_amount - Order.refunded_amount))
                                    .where(Order.payment_status == "paid")
                                    .group_by(Order.currency))).all()
    recent_orders = (await db.scalars(
        select(Order).order_by(Order.created_at.desc(), Order.id).limit(8)
        .options(selectinload(Order.items), selectinload(Order.shipments))
    )).all()
    recent_products = (await db.scalars(
        select(Product).where(Product.published.is_(False)).order_by(Product.created_at.desc()).limit(8)
        .options(selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
    )).all()
    suppliers = (await db.execute(
        select(Supplier, func.count(SupplierAccount.customer_id))
        .outerjoin(SupplierAccount, SupplierAccount.supplier_id == Supplier.id)
        .group_by(Supplier.id).order_by(Supplier.name).limit(8)
    )).all()
    return {"data": {
        "metrics": {
            "totalOrders": order_count,
            "paidOrders": paid_count,
            "activeSuppliers": active_suppliers,
            "activeProducts": active_products,
            "unpublishedProducts": pending_products,
            "ordersAwaitingFulfillment": awaiting_fulfillment,
            "lowAvailabilityVariants": low_stock,
            "customers": customer_count,
            "brands": brand_count,
        },
        "notifications": {
            "unreadEmailThreads": unread_email_threads,
            "openContactRequests": open_contact_requests,
            "productsToReview": pending_products,
            "applicationsToReview": applications_to_review,
            "newSuppliers": new_suppliers,
            "newCustomers": new_customers,
            "newReservations": new_reservations,
            "newInterests": new_interests,
            "newWaitlistSignups": new_waitlist_signups,
        },
        "revenueByCurrency": [{"currency": currency, "amount": amount or 0} for currency, amount in revenue_rows],
        "ordersByStatus": [{"status": status, "count": count} for status, count in order_statuses],
        "recentOrders": [order_summary(order) for order in recent_orders],
        "unpublishedProducts": [product_summary(product) for product in recent_products],
        "suppliers": [{"id": str(supplier.id), "code": supplier.code, "name": supplier.name,
                       "active": supplier.active, "accountCount": account_count} for supplier, account_count in suppliers],
        "notice": "Supplier applications and sales history require dedicated workflows; no application or time-series sales records are currently stored.",
    }}


@router.get("/analytics", response_model=dict)
async def admin_analytics(
    period: str = Query(default="30d", alias="range", pattern="^(7d|30d|90d|all)$"),
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    now = utc_now()
    days = {"7d": 7, "30d": 30, "90d": 90}.get(period)
    cutoff = now - timedelta(days=days) if days is not None else None
    order_filters = [Order.created_at <= now]
    if cutoff is not None:
        order_filters.append(Order.created_at >= cutoff)
    bucket = "month" if period == "all" else "day"
    if db.bind.dialect.name == "postgresql":
        order_period = func.date_trunc(bucket, Order.created_at)
        reservation_period = func.date_trunc(bucket, ProductReservation.created_at)
        interest_period = func.date_trunc(bucket, ProductInterest.created_at)
        customer_period = func.date_trunc(bucket, Customer.created_at)
    else:
        date_format = "%Y-%m-01" if bucket == "month" else "%Y-%m-%d"
        order_period = func.strftime(date_format, Order.created_at)
        reservation_period = func.strftime(date_format, ProductReservation.created_at)
        interest_period = func.strftime(date_format, ProductInterest.created_at)
        customer_period = func.strftime(date_format, Customer.created_at)

    revenue_by_currency = (await db.execute(
        select(
            Order.currency,
            func.sum(Order.captured_amount),
            func.sum(Order.refunded_amount),
            func.sum(Order.captured_amount - Order.refunded_amount),
        )
        .where(*order_filters, Order.captured_amount > 0)
        .group_by(Order.currency)
        .order_by(Order.currency)
    )).all()
    revenue_rows = (await db.execute(
        select(
            order_period.label("period"),
            Order.currency,
            func.sum(Order.captured_amount),
            func.sum(Order.refunded_amount),
            func.sum(Order.captured_amount - Order.refunded_amount),
        )
        .where(*order_filters, Order.captured_amount > 0)
        .group_by(order_period, Order.currency)
        .order_by(order_period, Order.currency)
    )).all()
    order_rows = (await db.execute(
        select(
            order_period.label("period"),
            func.count(Order.id),
            func.sum(case((Order.payment_status == "paid", 1), else_=0)),
        )
        .where(*order_filters)
        .group_by(order_period)
        .order_by(order_period)
    )).all()

    reservation_filters = [ProductReservation.created_at <= now]
    interest_filters = [ProductInterest.created_at <= now]
    customer_filters = [Customer.role == "customer", Customer.created_at <= now]
    if cutoff is not None:
        reservation_filters.append(ProductReservation.created_at >= cutoff)
        interest_filters.append(ProductInterest.created_at >= cutoff)
        customer_filters.append(Customer.created_at >= cutoff)
    reservation_rows = (await db.execute(
        select(reservation_period.label("period"), func.count(ProductReservation.id))
        .where(*reservation_filters)
        .group_by(reservation_period)
        .order_by(reservation_period)
    )).all()
    interest_rows = (await db.execute(
        select(interest_period.label("period"), func.count(ProductInterest.id))
        .where(*interest_filters)
        .group_by(interest_period)
        .order_by(interest_period)
    )).all()
    customer_rows = (await db.execute(
        select(customer_period.label("period"), func.count(Customer.id))
        .where(*customer_filters)
        .group_by(customer_period)
        .order_by(customer_period)
    )).all()

    product_filters = [Order.captured_amount > 0, *order_filters]
    item_sales = OrderItem.unit_price * OrderItem.quantity - OrderItem.discount_amount
    product_rows = (await db.execute(
        select(
            Product.id,
            OrderItem.product_name,
            OrderItem.currency,
            func.sum(OrderItem.quantity),
            func.sum(item_sales),
        )
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(*product_filters)
        .group_by(Product.id, OrderItem.product_name, OrderItem.currency)
    )).all()
    products_by_id: dict[UUID, dict] = {}
    for product_id, name, currency, units_sold, sales_amount in product_rows:
        product = products_by_id.setdefault(product_id, {
            "productId": str(product_id),
            "name": name,
            "unitsSold": 0,
            "salesByCurrency": [],
        })
        product["unitsSold"] += units_sold or 0
        product["salesByCurrency"].append({"currency": currency, "amount": sales_amount or 0})
    for product in products_by_id.values():
        product["salesByCurrency"].sort(key=lambda row: row["currency"])
    top_products = sorted(
        products_by_id.values(),
        key=lambda product: (-product["unitsSold"], product["name"]),
    )[:10]

    maker_rows = (await db.execute(
        select(
            Brand.id,
            Brand.name,
            Product.id,
            OrderItem.currency,
            func.sum(OrderItem.quantity),
            func.sum(item_sales),
        )
        .join(Product, Product.brand_id == Brand.id)
        .join(ProductVariant, ProductVariant.product_id == Product.id)
        .join(OrderItem, OrderItem.variant_id == ProductVariant.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(*product_filters, Brand.is_demo.is_(False))
        .group_by(Brand.id, Brand.name, Product.id, OrderItem.currency)
    )).all()
    makers_by_id: dict[UUID, dict] = {}
    for maker_id, name, product_id, currency, units_sold, sales_amount in maker_rows:
        maker = makers_by_id.setdefault(maker_id, {
            "makerId": str(maker_id),
            "name": name,
            "productIds": set(),
            "unitsSold": 0,
            "salesByCurrency": {},
        })
        maker["productIds"].add(product_id)
        maker["unitsSold"] += units_sold or 0
        maker["salesByCurrency"][currency] = maker["salesByCurrency"].get(currency, 0) + (sales_amount or 0)
    maker_performance = sorted(
        [{
            "makerId": maker["makerId"],
            "name": maker["name"],
            "productCount": len(maker["productIds"]),
            "unitsSold": maker["unitsSold"],
            "salesByCurrency": [
                {"currency": currency, "amount": sales_amount}
                for currency, sales_amount in sorted(maker["salesByCurrency"].items())
            ],
        } for maker in makers_by_id.values()],
        key=lambda maker: (-maker["unitsSold"], maker["name"]),
    )[:10]

    country_expr = func.coalesce(
        func.nullif(Order.shipping_address["countryCode"].as_string(), ""),
        func.nullif(Order.shipping_address["country_code"].as_string(), ""),
        "OTHER",
    )
    country_order_rows = (await db.execute(
        select(
            country_expr.label("country"),
            func.count(Order.id),
            func.sum(case((Order.payment_status == "paid", 1), else_=0)),
        )
        .where(*order_filters)
        .group_by(country_expr)
        .order_by(func.count(Order.id).desc(), country_expr)
    )).all()
    country_revenue_rows = (await db.execute(
        select(
            country_expr.label("country"),
            Order.currency,
            func.sum(Order.captured_amount),
            func.sum(Order.refunded_amount),
            func.sum(Order.captured_amount - Order.refunded_amount),
        )
        .where(*order_filters, Order.captured_amount > 0)
        .group_by(country_expr, Order.currency)
        .order_by(country_expr, Order.currency)
    )).all()
    country_sales_by_code = {
        country or "OTHER": {
            "country": country or "OTHER",
            "orders": order_count or 0,
            "paidOrders": paid_count or 0,
            "revenueByCurrency": [],
        }
        for country, order_count, paid_count in country_order_rows
    }
    for country, currency, captured, refunded, net in country_revenue_rows:
        country_sales_by_code.setdefault(country or "OTHER", {
            "country": country or "OTHER",
            "orders": 0,
            "paidOrders": 0,
            "revenueByCurrency": [],
        })["revenueByCurrency"].append({
            "currency": currency,
            "capturedAmount": captured or 0,
            "refundedAmount": refunded or 0,
            "netAmount": net or 0,
        })
    country_sales = sorted(
        country_sales_by_code.values(),
        key=lambda country: (-country["orders"], country["country"]),
    )[:10]
    reservation_countries = (await db.execute(
        select(ProductReservation.country, func.count(ProductReservation.id))
        .where(*reservation_filters)
        .group_by(ProductReservation.country)
        .order_by(func.count(ProductReservation.id).desc(), ProductReservation.country)
        .limit(10)
    )).all()
    interest_countries = (await db.execute(
        select(ProductInterest.country, func.count(ProductInterest.id))
        .where(*interest_filters)
        .group_by(ProductInterest.country)
        .order_by(func.count(ProductInterest.id).desc(), ProductInterest.country)
        .limit(10)
    )).all()

    series_by_period: dict[str, dict[str, int]] = {}
    def period_key(value) -> str:
        return value.isoformat()[:10] if isinstance(value, datetime) else str(value)

    for row_period, count, paid_count in order_rows:
        series_by_period[period_key(row_period)] = {"orders": count or 0, "paidOrders": paid_count or 0}
    for rows_for_metric, metric in (
        (reservation_rows, "reservations"),
        (interest_rows, "interests"),
        (customer_rows, "newCustomers"),
    ):
        for row_period, count in rows_for_metric:
            series_by_period.setdefault(period_key(row_period), {"orders": 0, "paidOrders": 0})[metric] = count or 0
    series = [
        {"period": row_period, **{
            "orders": values.get("orders", 0),
            "paidOrders": values.get("paidOrders", 0),
            "reservations": values.get("reservations", 0),
            "interests": values.get("interests", 0),
            "newCustomers": values.get("newCustomers", 0),
        }}
        for row_period, values in sorted(series_by_period.items())
    ]
    return {"data": {
        "period": {"range": period, "bucket": bucket, "from": cutoff.isoformat() if cutoff else None, "to": now.isoformat()},
        "summary": {
            "orders": sum(row["orders"] for row in series),
            "paidOrders": sum(row["paidOrders"] for row in series),
            "reservations": sum(row["reservations"] for row in series),
            "interests": sum(row["interests"] for row in series),
            "newCustomers": sum(row["newCustomers"] for row in series),
            "revenueByCurrency": [{
                "currency": currency,
                "capturedAmount": captured or 0,
                "refundedAmount": refunded or 0,
                "netAmount": net or 0,
            } for currency, captured, refunded, net in revenue_by_currency],
        },
        "series": series,
        "revenueSeries": [{
            "period": period_key(row_period),
            "currency": currency,
            "capturedAmount": captured or 0,
            "refundedAmount": refunded or 0,
            "netAmount": net or 0,
        } for row_period, currency, captured, refunded, net in revenue_rows],
        "topProducts": top_products,
        "makerPerformance": maker_performance,
        "countrySales": country_sales,
        "reservationsByCountry": [{"country": country, "count": count} for country, count in reservation_countries],
        "interestsByCountry": [{"country": country, "count": count} for country, count in interest_countries],
    }}


@router.get("/orders", response_model=dict)
async def list_orders(
    _admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=120), status: str | None = None,
    payment_status: str | None = None, fulfillment_status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100), offset: int = Query(default=0, ge=0),
):
    query = select(Order).options(selectinload(Order.items), selectinload(Order.shipments))
    if status:
        query = query.where(Order.status == status)
    if payment_status:
        query = query.where(Order.payment_status == payment_status)
    if fulfillment_status:
        query = query.where(Order.fulfillment_status == fulfillment_status)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Order.order_number.ilike(term), Order.customer_email.ilike(term)))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = (await db.scalars(query.order_by(Order.created_at.desc(), Order.id).offset(offset).limit(limit))).all()
    return {"data": {"items": [order_summary(order) for order in rows], "total": total, "limit": limit, "offset": offset}}


@router.get("/orders/{order_id}", response_model=dict)
async def get_order(order_id: UUID, _admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    order = await order_query(db, order_id)
    if not order:
        raise HTTPException(404, "Order not found.")
    lines = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))).all()
    supplier_rows = (await db.execute(
        select(SupplierPurchaseOrder, Supplier)
        .join(Supplier, Supplier.id == SupplierPurchaseOrder.supplier_id)
        .where(SupplierPurchaseOrder.order_id == order.id)
        .options(selectinload(SupplierPurchaseOrder.items))
        .order_by(SupplierPurchaseOrder.created_at, SupplierPurchaseOrder.id)
    )).all()
    return {"data": {
        **order_summary(order),
        "subtotalAmount": order.subtotal_amount,
        "discountAmount": order.discount_amount,
        "shippingAmount": order.shipping_amount,
        "taxAmount": order.tax_amount,
        "capturedAmount": order.captured_amount,
        "refundedAmount": order.refunded_amount,
        "items": [{"id": str(item.id), "name": item.name, "quantity": item.quantity,
                   "unitPrice": item.unit_price, "currency": item.currency,
                   "supplierOfferId": str(item.supplier_offer_id) if item.supplier_offer_id else None,
                   "productSnapshot": item.product_snapshot} for item in lines],
        "shipments": [{"id": str(shipment.id), "number": shipment.shipment_number, "status": shipment.status,
                       "carrier": shipment.carrier, "trackingNumber": shipment.tracking_number,
                       "trackingUrl": shipment.tracking_url, "estimatedDeliveryAt": shipment.estimated_delivery_at.isoformat() if shipment.estimated_delivery_at else None}
                      for shipment in order.shipments],
        "supplierFulfillments": [{"purchaseOrderId": str(po.id), "purchaseOrderNumber": po.po_number,
                                   "supplier": supplier.name, "status": po.status,
                                   "supplierOrderId": po.supplier_order_id,
                                   "items": [{"productName": item.product_name, "supplierSku": item.supplier_sku,
                                              "quantity": item.quantity, "unitCost": item.unit_cost}
                                             for item in po.items]}
                                  for po, supplier in supplier_rows],
    }}


@router.get("/products", response_model=dict)
async def list_products(
    _admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=120), published: bool | None = None,
    limit: int = Query(default=100, ge=1, le=200), offset: int = Query(default=0, ge=0),
):
    query = select(Product).options(selectinload(Product.variants), selectinload(Product.category),
                                    selectinload(Product.brand), selectinload(Product.images))
    if published is not None:
        query = query.where(Product.published.is_(published))
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Product.name.ilike(term), Product.sku.ilike(term), Product.slug.ilike(term)))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = (await db.scalars(query.order_by(Product.created_at.desc(), Product.id).offset(offset).limit(limit))).all()
    return {"data": {"items": [product_summary(product) for product in rows], "total": total, "limit": limit, "offset": offset}}


@router.patch("/products/{product_id}/publication", response_model=dict)
async def set_product_publication(product_id: UUID, payload: AdminProductPublicationRequest, request: Request,
                                  admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-product-publication", 30, 60)
    published = payload.published
    product = await db.scalar(select(Product).where(Product.id == product_id).with_for_update().options(
        selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images)))
    if not product:
        raise HTTPException(404, "Product not found.")
    if published:
        try:
            await ensure_product_translations(product, db)
        except TranslationUnavailableError as error:
            raise HTTPException(503, "Product cannot be published until Japanese and Korean translations are ready.") from error
    product.published = published
    await db.commit()
    await db.refresh(product)
    return {"data": product_summary(product)}


@router.patch("/products/{product_id}/category", response_model=dict)
async def set_product_category(
    product_id: UUID,
    payload: AdminProductCategoryRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-product-category", 30, 60)
    product = await db.scalar(select(Product).where(Product.id == product_id).with_for_update().options(
        selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images),
    ))
    if product is None:
        raise HTTPException(404, "Product not found.")
    category = await db.scalar(select(ProductCategory).where(
        ProductCategory.id == payload.categoryId,
        ProductCategory.active.is_(True),
        ProductCategory.slug.in_(PRODUCT_CATEGORY_SLUGS),
    ))
    if category is None:
        raise HTTPException(422, "Choose an active product category.")
    has_children = await db.scalar(select(ProductCategory.id).where(
        ProductCategory.parent_id == category.id,
        ProductCategory.active.is_(True),
        ProductCategory.slug.in_(PRODUCT_CATEGORY_SLUGS),
    ).limit(1))
    if has_children:
        raise HTTPException(422, "Choose a product subcategory.")
    product.category = category
    product.category_name = category.name
    await db.commit()
    await db.refresh(product)
    return {"data": product_summary(product)}


@router.get("/reservations", response_model=dict)
async def list_product_reservations(_admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    products = (await db.scalars(
        select(Product).order_by(Product.name, Product.id)
        .options(selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
    )).all()
    counts = dict((await db.execute(
        select(ProductReservation.product_id, func.count(ProductReservation.id))
        .group_by(ProductReservation.product_id)
    )).all())
    country_counts: dict[UUID, list[dict[str, str | int]]] = {}
    for product_id, country, count in (await db.execute(
        select(ProductReservation.product_id, ProductReservation.country, func.count(ProductReservation.id))
        .group_by(ProductReservation.product_id, ProductReservation.country)
        .order_by(ProductReservation.country)
    )).all():
        country_counts.setdefault(product_id, []).append({"country": country, "count": count})
    return {"data": [
        {
            **product_summary(product),
            "reservationCount": counts.get(product.id, 0),
            "reservationsByCountry": country_counts.get(product.id, []),
            "reservationMinimumReachedAt": (
                product.reservation_minimum_reached_at.isoformat()
                if product.reservation_minimum_reached_at else None
            ),
        }
        for product in products
    ]}


@router.get("/interests", response_model=dict)
async def list_product_interests(_admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    products = (await db.scalars(
        select(Product).order_by(Product.name, Product.id)
        .options(selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
    )).all()
    counts = dict((await db.execute(
        select(ProductInterest.product_id, func.count(ProductInterest.id))
        .group_by(ProductInterest.product_id)
    )).all())
    country_counts: dict[UUID, list[dict[str, str | int]]] = {}
    for product_id, country, count in (await db.execute(
        select(ProductInterest.product_id, ProductInterest.country, func.count(ProductInterest.id))
        .group_by(ProductInterest.product_id, ProductInterest.country)
        .order_by(ProductInterest.country)
    )).all():
        country_counts.setdefault(product_id, []).append({"country": country, "count": count})
    return {"data": [
        {
            **product_summary(product),
            "interestCount": counts.get(product.id, 0),
            "interestsByCountry": country_counts.get(product.id, []),
        }
        for product in products
    ]}


@router.get("/waitlist", response_model=dict)
async def list_waitlist_products(
    response: Response,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    response.headers["Cache-Control"] = "no-store"
    notification_key = literal("waitlist_availability:") + cast(ProductWaitlistEntry.id, String)
    waitlist_counts = (
        select(
            ProductWaitlistEntry.product_id.label("product_id"),
            func.count(ProductWaitlistEntry.id).label("entry_count"),
            func.sum(case((EmailNotification.id.is_(None), 1), else_=0)).label("waiting_count"),
            func.sum(case((EmailNotification.status.in_(("pending", "processing")), 1), else_=0)).label("queued_count"),
            func.sum(case((EmailNotification.status == "sent", 1), else_=0)).label("sent_count"),
            func.sum(case((EmailNotification.status == "failed", 1), else_=0)).label("failed_count"),
            func.max(ProductWaitlistEntry.created_at).label("latest_joined_at"),
        )
        .outerjoin(EmailNotification, EmailNotification.notification_key == notification_key)
        .group_by(ProductWaitlistEntry.product_id)
        .subquery()
    )
    available_products = (
        select(ProductVariant.product_id.label("product_id"))
        .where(sellable_variant())
        .group_by(ProductVariant.product_id)
        .subquery()
    )
    query = (
        select(
            Product,
            waitlist_counts.c.entry_count,
            waitlist_counts.c.waiting_count,
            waitlist_counts.c.queued_count,
            waitlist_counts.c.sent_count,
            waitlist_counts.c.failed_count,
            waitlist_counts.c.latest_joined_at,
            available_products.c.product_id.is_not(None).label("available"),
        )
        .join(waitlist_counts, waitlist_counts.c.product_id == Product.id)
        .outerjoin(available_products, available_products.c.product_id == Product.id)
        .where(Product.published.is_(True))
    )
    if q and q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        term = f"%{escaped}%"
        query = query.where(or_(Product.name.ilike(term, escape="\\"), Product.sku.ilike(term, escape="\\")))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = (await db.execute(
        query.options(selectinload(Product.images), selectinload(Product.variants))
        .order_by(waitlist_counts.c.entry_count.desc(), Product.name, Product.id)
        .offset(offset)
        .limit(limit)
    )).all()
    return {"data": {
        "items": [{
            "productId": str(product.id),
            "productName": product.name,
            "sku": product.sku,
            "image": product_summary(product)["image"],
            "available": bool(available),
            "entryCount": entry_count,
            "waitingCount": waiting_count,
            "queuedCount": queued_count,
            "sentCount": sent_count,
            "failedCount": failed_count,
            "latestJoinedAt": latest_joined_at.isoformat(),
        } for product, entry_count, waiting_count, queued_count, sent_count, failed_count, latest_joined_at, available in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }}


@router.get("/waitlist/{product_id}", response_model=dict)
async def list_waitlist_entries(
    product_id: UUID,
    response: Response,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    response.headers["Cache-Control"] = "no-store"
    product = await db.scalar(select(Product).where(Product.id == product_id, Product.published.is_(True)))
    if product is None:
        raise HTTPException(404, "Waitlist product not found.")
    notification_key = literal("waitlist_availability:") + cast(ProductWaitlistEntry.id, String)
    query = (
        select(ProductWaitlistEntry, EmailNotification.status, EmailNotification.sent_at)
        .outerjoin(EmailNotification, EmailNotification.notification_key == notification_key)
        .where(ProductWaitlistEntry.product_id == product_id)
    )
    total = await db.scalar(
        select(func.count()).select_from(ProductWaitlistEntry).where(ProductWaitlistEntry.product_id == product_id)
    ) or 0
    rows = (await db.execute(
        query.order_by(ProductWaitlistEntry.created_at, ProductWaitlistEntry.id).offset(offset).limit(limit)
    )).all()
    return {"data": {
        "productId": str(product.id),
        "productName": product.name,
        "items": [{
            "id": str(entry.id),
            "email": entry.email,
            "firstName": entry.first_name,
            "createdAt": entry.created_at.isoformat(),
            "notificationStatus": status or "not_sent",
            "notifiedAt": sent_at.isoformat() if sent_at else None,
        } for entry, status, sent_at in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }}


@router.post("/waitlist/{product_id}/notify", response_model=dict, status_code=202)
async def notify_product_waitlist(
    product_id: UUID,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-waitlist-notify", 10, 3600)
    product = await db.scalar(
        select(Product).where(Product.id == product_id, Product.published.is_(True)).with_for_update()
    )
    if product is None:
        raise HTTPException(404, "Waitlist product not found.")
    available_variant = await db.scalar(
        select(ProductVariant.id).where(ProductVariant.product_id == product_id, sellable_variant()).limit(1)
    )
    if available_variant is None:
        raise HTTPException(409, "This product has no available stock for a waitlist notification.")
    entries = list((await db.scalars(
        select(ProductWaitlistEntry)
        .where(ProductWaitlistEntry.product_id == product_id)
        .order_by(ProductWaitlistEntry.created_at, ProductWaitlistEntry.id)
        .with_for_update()
    )).all())
    if not entries:
        return {"data": {"productId": str(product.id), "queued": 0, "alreadyQueued": 0, "total": 0}}

    mail_settings = get_settings()
    mailbox_key = None
    if not mail_settings.contact_email_configured:
        mailbox_key = next(
            (key for key, mailbox in mail_settings.email_inbox_accounts.items() if mailbox.smtp_configured),
            None,
        )
        if mailbox_key is None:
            raise HTTPException(503, "Transactional email is not configured.")

    keys = [f"waitlist_availability:{entry.id}" for entry in entries]
    existing_keys = set((await db.scalars(
        select(EmailNotification.notification_key).where(EmailNotification.notification_key.in_(keys))
    )).all())
    new_entries = [
        entry for entry in entries
        if f"waitlist_availability:{entry.id}" not in existing_keys
    ]
    product_url = f"{mail_settings.storefront_base_url.rstrip('/')}/products/{product.slug}"
    for entry in new_entries:
        event = OutboxEvent(
            event_type="product.waitlist_availability_notification_requested",
            payload={"productId": str(product.id), "waitlistEntryId": str(entry.id)},
        )
        enqueue_email_notification(
            db,
            event,
            template="product_availability",
            recipient=entry.email,
            payload={
                "productName": product.name,
                "productUrl": product_url,
                "firstName": entry.first_name,
                "mailboxKey": mailbox_key,
            },
            notification_key=f"waitlist_availability:{entry.id}",
        )
    await db.commit()
    return {"data": {
        "productId": str(product.id),
        "queued": len(new_entries),
        "alreadyQueued": len(existing_keys),
        "total": len(entries),
    }}


@router.get("/reservations/entries", response_model=dict)
async def list_reservation_entries(
    response: Response,
    product_id: UUID | None = Query(default=None, alias="productId"),
    country: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=180),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    filters = reservation_filters(product_id, country, q)
    base = select(ProductReservation, Product.name).join(Product, Product.id == ProductReservation.product_id)
    total = await db.scalar(
        select(func.count(ProductReservation.id))
        .join(Product, Product.id == ProductReservation.product_id)
        .where(*filters)
    ) or 0
    rows = (await db.execute(
        base.where(*filters)
        .order_by(ProductReservation.created_at.desc(), ProductReservation.id.desc())
        .limit(limit)
        .offset(offset)
    )).all()
    return {"data": {"items": [
        {
            "id": str(reservation.id),
            "productId": str(reservation.product_id),
            "productName": product_name,
            "email": reservation.email,
            "country": reservation.country,
            "createdAt": reservation.created_at.isoformat(),
        }
        for reservation, product_name in rows
    ], "total": total, "limit": limit, "offset": offset}}


@router.get("/reservations/export.csv")
async def export_reservation_entries(
    product_id: UUID | None = Query(default=None, alias="productId"),
    country: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=180),
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    filters = reservation_filters(product_id, country, q)
    _, rows = await reservation_export_data(db, filters)
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(["Reservation ID", "Product", "Email", "Country", "Created at"])
    for reservation_id, product_name, email, country_name, created_at in rows:
        writer.writerow([
            safe_csv_cell(str(reservation_id)),
            safe_csv_cell(product_name),
            safe_csv_cell(email),
            safe_csv_cell(country_name),
            safe_csv_cell(created_at.isoformat()),
        ])
    return Response(
        content=f"\ufeff{output.getvalue()}",
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="ponyo-reservations.csv"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/reservations/export.xlsx")
async def export_reservation_workbook(
    product_id: UUID | None = Query(default=None, alias="productId"),
    country: str | None = Query(default=None, max_length=100),
    q: str | None = Query(default=None, max_length=180),
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    filters = reservation_filters(product_id, country, q)
    total, rows = await reservation_export_data(db, filters)
    content = reservation_workbook(rows, {
        "product_id": str(product_id) if product_id else None,
        "country": country.strip() if country and country.strip() else None,
        "q": q.strip() if q and q.strip() else None,
    })
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="ponyo-reservations.xlsx"',
            "Cache-Control": "no-store",
            "X-Export-Row-Count": str(total),
        },
    )


@router.patch("/products/{product_id}/reservations", response_model=dict)
async def set_product_reservation_settings(
    product_id: UUID,
    payload: AdminProductReservationSettings,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-product-reservations", 30, 60)
    product = await db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if product is None:
        raise HTTPException(404, "Product not found.")
    reservation_count = await db.scalar(select(func.count()).select_from(ProductReservation).where(
        ProductReservation.product_id == product.id,
    )) or 0
    if payload.reservationDeadline is not None and payload.reservationDeadline < utc_now().date():
        raise HTTPException(422, "Choose a reservation deadline that has not passed.")
    if product.production_status in {"preorder_invited", "target_missed"}:
        raise HTTPException(409, "This reservation campaign is already complete and cannot be changed.")
    product.reservations_open = payload.reservationsOpen
    product.reservation_target = payload.reservationTarget
    product.reservation_deadline = payload.reservationDeadline
    if payload.reservationTarget is None or reservation_count < payload.reservationTarget:
        product.reservation_minimum_reached_at = None
        product.production_status = "collecting"
    elif product.reservation_minimum_reached_at is None:
        product.reservation_minimum_reached_at = utc_now()
        product.reservations_open = False
        product.production_status = "target_reached"
        db.add(OutboxEvent(event_type="product.reservation_minimum_reached", payload={
            "productId": str(product.id),
            "productName": product.name,
            "reservationCount": reservation_count,
            "target": payload.reservationTarget,
        }))
    else:
        product.reservations_open = False
        product.production_status = "target_reached"
    await db.commit()
    return {"data": {
        "id": str(product.id),
        "reservationsOpen": product.reservations_open,
        "reservationTarget": product.reservation_target,
        "reservationDeadline": product.reservation_deadline.isoformat() if product.reservation_deadline else None,
        "productionStatus": product.production_status,
        "reservationMinimumReachedAt": (
            product.reservation_minimum_reached_at.isoformat()
            if product.reservation_minimum_reached_at else None
        ),
    }}


@router.post("/products/{product_id}/production-approval", response_model=dict)
async def approve_product_production(
    product_id: UUID,
    payload: AdminProductProductionApprovalRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-production-approval", 20, 60)
    if not payload.confirmMakerReady:
        raise HTTPException(422, "Confirm that the maker is ready before opening the preorder invitation stage.")
    product = await db.scalar(select(Product).where(Product.id == product_id).with_for_update())
    if product is None:
        raise HTTPException(404, "Product not found.")
    if product.production_status == "preorder_invited":
        return {"data": {"productId": str(product.id), "status": product.production_status, "invitationsQueued": 0}}
    if product.production_status != "target_reached" or product.reservation_target is None:
        raise HTTPException(409, "The reservation target must be reached before production can be approved.")
    reservation_count = await db.scalar(select(func.count()).select_from(ProductReservation).where(
        ProductReservation.product_id == product.id,
    )) or 0
    if reservation_count < product.reservation_target:
        raise HTTPException(409, "The current reservation count is below the production target.")

    mail_settings = get_settings()
    mailbox_key = None
    if not mail_settings.contact_email_configured:
        mailbox_key = next(
            (key for key, mailbox in mail_settings.email_inbox_accounts.items() if mailbox.smtp_configured),
            None,
        )
        if mailbox_key is None:
            raise HTTPException(503, "Transactional email is not configured.")

    reservations = list((await db.scalars(
        select(ProductReservation).where(ProductReservation.product_id == product.id)
        .order_by(ProductReservation.created_at, ProductReservation.id)
    )).all())
    product_url = f"{mail_settings.storefront_base_url.rstrip('/')}/products/{product.slug}"
    now = utc_now()
    for reservation in reservations:
        event = OutboxEvent(
            event_type="product.preorder_invitation_requested",
            payload={"productId": str(product.id), "reservationId": str(reservation.id)},
        )
        enqueue_email_notification(
            db,
            event,
            template="reservation_preorder_invitation",
            recipient=reservation.email,
            payload={
                "productName": product.name,
                "productUrl": product_url,
                "reservationTarget": product.reservation_target,
                "mailboxKey": mailbox_key,
            },
            notification_key=f"reservation_preorder_invitation:{reservation.id}",
        )
    product.production_approved_at = now
    product.preorder_invites_sent_at = now
    product.production_status = "preorder_invited"
    await db.commit()
    return {"data": {
        "productId": str(product.id),
        "status": product.production_status,
        "invitationsQueued": len(reservations),
        "paymentEnabled": False,
    }}


def supplier_offer_change_payload(change, supplier, offer, inventory, variant, product) -> dict:
    return {
        "id": str(change.id),
        "supplierId": str(supplier.id),
        "supplierName": supplier.name,
        "offerId": str(offer.id),
        "productId": str(product.id),
        "productName": product.name,
        "variantId": str(variant.id),
        "variantSku": variant.sku,
        "currency": variant.currency,
        "current": {
            "productionCapacity": inventory.on_hand,
            "costAmount": offer.cost_amount,
            "minimumOrderQuantity": offer.minimum_order_quantity,
            "leadTimeDays": offer.lead_time_days,
            "isPrimary": offer.is_primary,
            "retailPriceAmount": variant.price_amount,
        },
        "proposed": {
            "productionCapacity": change.production_capacity,
            "costAmount": change.cost_amount,
            "minimumOrderQuantity": change.minimum_order_quantity,
            "leadTimeDays": change.lead_time_days,
        },
        "status": change.status,
        "submittedAt": change.submitted_at.isoformat(),
        "reviewedAt": change.reviewed_at.isoformat() if change.reviewed_at else None,
        "decisionNote": change.decision_note,
    }


@router.get("/supplier-offer-changes", response_model=dict)
async def list_supplier_offer_changes(
    status: str = Query(default="pending", pattern="^(pending|approved|rejected|all)$"),
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(SupplierOfferChangeRequest, Supplier, SupplierOffer, SupplierInventory, ProductVariant, Product)
        .join(Supplier, Supplier.id == SupplierOfferChangeRequest.supplier_id)
        .join(SupplierOffer, SupplierOffer.id == SupplierOfferChangeRequest.offer_id)
        .join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
        .join(ProductVariant, ProductVariant.id == SupplierOffer.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
    )
    if status != "all":
        query = query.where(SupplierOfferChangeRequest.status == status)
    rows = (await db.execute(
        query.order_by(SupplierOfferChangeRequest.submitted_at.desc(), SupplierOfferChangeRequest.id)
        .limit(200)
    )).all()
    return {"data": [
        supplier_offer_change_payload(change, supplier, offer, inventory, variant, product)
        for change, supplier, offer, inventory, variant, product in rows
    ]}


@router.post("/supplier-offer-changes/{change_id}/decision", response_model=dict)
async def decide_supplier_offer_change(
    change_id: UUID,
    payload: AdminSupplierOfferChangeDecision,
    request: Request,
    admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-supplier-offer-change", 30, 60)
    variant_id = await db.scalar(
        select(ProductVariant.id)
        .join(SupplierOffer, SupplierOffer.variant_id == ProductVariant.id)
        .join(SupplierOfferChangeRequest, SupplierOfferChangeRequest.offer_id == SupplierOffer.id)
        .where(SupplierOfferChangeRequest.id == change_id)
    )
    if variant_id is None:
        raise HTTPException(404, "Supplier change request not found.")
    variant = await db.scalar(select(ProductVariant).where(
        ProductVariant.id == variant_id,
    ).with_for_update().execution_options(populate_existing=True))
    change = await db.scalar(select(SupplierOfferChangeRequest).where(
        SupplierOfferChangeRequest.id == change_id,
    ).with_for_update().execution_options(populate_existing=True))
    if variant is None or change is None:
        raise HTTPException(404, "Supplier change request not found.")
    offer = await db.scalar(select(SupplierOffer).where(
        SupplierOffer.id == change.offer_id,
        SupplierOffer.variant_id == variant.id,
    ).with_for_update().execution_options(populate_existing=True))
    inventory = await db.scalar(select(SupplierInventory).where(
        SupplierInventory.offer_id == change.offer_id,
    ).with_for_update().execution_options(populate_existing=True))
    supplier = await db.get(Supplier, change.supplier_id)
    product = await db.get(Product, variant.product_id)
    if offer is None or inventory is None or supplier is None or product is None:
        raise HTTPException(404, "Supplier listing is no longer available.")
    if change.status != "pending":
        raise HTTPException(409, "This supplier change request has already been reviewed.")

    if payload.decision == "approve":
        if change.production_capacity < inventory.reserved:
            raise HTTPException(409, "Approved production capacity cannot be lower than units already reserved.")
        if offer.currency != variant.currency:
            raise HTTPException(409, "Supplier offer currency no longer matches the product variant.")
        primaries = (await db.scalars(select(SupplierOffer).where(
            SupplierOffer.variant_id == variant.id,
        ).with_for_update())).all()
        has_primary = any(candidate.is_primary for candidate in primaries)
        if (offer.is_primary or not has_primary) and not payload.isPrimary:
            raise HTTPException(409, "This variant must retain a primary maker. Select this offer as primary or choose another approved primary first.")
        if payload.isPrimary:
            for candidate in primaries:
                candidate.is_primary = candidate.id == offer.id
        offer.cost_amount = change.cost_amount
        offer.minimum_order_quantity = change.minimum_order_quantity
        offer.lead_time_days = change.lead_time_days
        inventory.on_hand = change.production_capacity
        inventory.last_synced_at = utc_now()
        if payload.isPrimary:
            variant.price_amount = retail_price_for_wholesale_cost(change.cost_amount)
            variant.compare_at_amount = None
    change.status = "approved" if payload.decision == "approve" else "rejected"
    change.decision_note = payload.note
    change.reviewed_at = utc_now()
    change.reviewed_by = admin.id
    if payload.decision == "approve":
        await refresh_synced_variant(db, variant.id)
    await db.commit()
    await db.refresh(change)
    return {"data": supplier_offer_change_payload(change, supplier, offer, inventory, variant, product)}


@router.patch("/products/{product_id}/proof", response_model=dict)
async def update_product_proof(
    product_id: UUID,
    payload: AdminProductProofRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-product-proof", 30, 60)
    product = await db.scalar(select(Product).where(Product.id == product_id).with_for_update().options(
        selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images),
    ))
    if product is None:
        raise HTTPException(404, "Product not found.")
    changes = payload.model_dump(exclude_unset=True)
    field_map = {
        "materials": "materials",
        "weightGrams": "weight_grams",
        "editionCount": "edition_count",
        "estimatedDeliveryDate": "estimated_delivery_date",
        "onlyAtPonyo": "only_at_ponyo",
        "shippingCountries": "shipping_countries",
    }
    for field, value in changes.items():
        setattr(product, field_map[field], value)
    await db.commit()
    return {"data": product_summary(product)}


@router.get("/suppliers", response_model=dict)
async def list_suppliers(_admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Supplier, func.count(func.distinct(SupplierAccount.customer_id)),
               func.count(func.distinct(SupplierOffer.id)))
        .outerjoin(SupplierAccount, SupplierAccount.supplier_id == Supplier.id)
        .outerjoin(SupplierOffer, SupplierOffer.supplier_id == Supplier.id)
        .group_by(Supplier.id).order_by(Supplier.name)
    )).all()
    return {"data": [{"id": str(supplier.id), "code": supplier.code, "name": supplier.name,
                       "contactEmail": supplier.contact_email, "active": supplier.active,
                       "isDemo": supplier.is_demo, "accountCount": accounts, "offerCount": offers}
                      for supplier, accounts, offers in rows]}


@router.get("/brands", response_model=dict)
async def list_brands(_admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Brand, func.count(Product.id))
        .outerjoin(Product, Product.brand_id == Brand.id)
        .group_by(Brand.id)
        .order_by(Brand.name)
    )).all()
    return {"data": [{"id": str(brand.id), "slug": brand.slug, "name": brand.name,
                       "isDemo": brand.is_demo, "productCount": product_count,
                       "profileImageUrl": brand.profile_image_url, "makerStory": brand.maker_story,
                       "philosophy": brand.philosophy, "process": brand.process, "location": brand.location,
                       "specialties": brand.specialties or [], "website": brand.website,
                       "socialMedia": brand.social_media}
                      for brand, product_count in rows]}


@router.patch("/brands/{brand_id}/profile", response_model=dict)
async def update_brand_profile(
    brand_id: UUID,
    payload: AdminBrandProfileRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-brand-profile", 30, 60)
    brand = await db.scalar(select(Brand).where(Brand.id == brand_id).with_for_update())
    if brand is None:
        raise HTTPException(404, "Brand not found.")
    changes = payload.model_dump(exclude_unset=True)
    field_map = {
        "profileImageUrl": "profile_image_url",
        "makerStory": "maker_story",
        "philosophy": "philosophy",
        "process": "process",
        "location": "location",
        "specialties": "specialties",
        "website": "website",
        "socialMedia": "social_media",
    }
    for field, value in changes.items():
        if field in {"profileImageUrl", "website", "socialMedia"} and value is not None:
            value = str(value)
        setattr(brand, field_map[field], value)
    await db.commit()
    return {"data": {"id": str(brand.id), "slug": brand.slug, "name": brand.name}}


@router.get("/maker-applications", response_model=dict)
async def list_maker_applications(_admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    applications = (await db.scalars(
        select(MakerApplication).order_by(MakerApplication.created_at.desc(), MakerApplication.id)
    )).all()
    results = []
    for application in applications:
        photos = []
        try:
            for photo in application.product_photos:
                photos.append(
                    await signed_maker_application_photo_url(photo)
                    if photo.startswith("maker-applications/")
                    else photo
                )
        except MakerPhotoStorageError as error:
            raise HTTPException(503, "Maker application photos are temporarily unavailable.") from error
        results.append({
            "id": str(application.id),
            "makerName": application.maker_name,
            "contactPerson": application.contact_person,
            "email": application.email,
            "country": application.country,
            "city": application.city,
            "website": application.website or None,
            "socialMedia": application.social_media or None,
            "productUrl": application.product_url,
            "productDescription": application.product_description,
            "provenDesireEvidence": application.proven_desire_evidence,
            "materials": application.materials,
            "priceRange": application.price_range,
            "productPhotos": photos,
            "ponyoExclusivity": application.ponyo_exclusivity,
            "status": application.status,
            "createdAt": application.created_at.isoformat(),
        })
    return {"data": results}


@router.patch("/maker-applications/{application_id}/status", response_model=dict)
async def set_maker_application_status(
    application_id: UUID,
    payload: AdminMakerApplicationStatusRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-maker-application-status", 30, 60)
    application = await db.scalar(select(MakerApplication).where(
        MakerApplication.id == application_id,
    ).with_for_update())
    if application is None:
        raise HTTPException(404, "Maker application not found.")
    application.status = payload.status
    await db.commit()
    return {"data": {"id": str(application.id), "status": application.status}}


@router.patch("/suppliers/{supplier_id}/status", response_model=dict)
async def set_supplier_status(supplier_id: UUID, payload: AdminSupplierStatusRequest, request: Request,
                              _admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-supplier-status", 30, 60)
    active = payload.active
    supplier = await db.scalar(select(Supplier).where(Supplier.id == supplier_id).with_for_update())
    if not supplier:
        raise HTTPException(404, "Supplier not found.")
    supplier.active = active
    await db.commit()
    return {"data": {"id": str(supplier.id), "code": supplier.code, "name": supplier.name,
                      "active": supplier.active, "isDemo": supplier.is_demo}}


@router.get("/customers", response_model=dict)
async def list_customers(
    _admin: Customer = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=10, ge=1, le=100), offset: int = Query(default=0, ge=0),
):
    query = select(Customer).where(Customer.role == "customer")
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Customer.email.ilike(term), Customer.first_name.ilike(term), Customer.last_name.ilike(term)))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = (await db.scalars(
        query.order_by(Customer.created_at.desc(), Customer.id).offset(offset).limit(limit)
    )).all()
    return {"data": {
        "items": [{"id": str(customer.id), "firstName": customer.first_name, "lastName": customer.last_name,
                   "email": customer.email, "emailVerified": customer.email_verified,
                   "createdAt": customer.created_at.isoformat()} for customer in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }}


@router.get("/newsletter/subscriptions", response_model=dict)
async def list_newsletter_subscriptions(
    response: Response,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=10, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    response.headers["Cache-Control"] = "no-store"
    query = select(NewsletterSubscription)
    if q and q.strip():
        term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.where(NewsletterSubscription.email.ilike(f"%{term}%", escape="\\"))
    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    subscribed_count = await db.scalar(
        select(func.count()).select_from(NewsletterSubscription).where(NewsletterSubscription.status == "subscribed")
    ) or 0
    rows = (await db.scalars(
        query.order_by(NewsletterSubscription.created_at.desc(), NewsletterSubscription.id)
        .offset(offset).limit(limit)
    )).all()
    return {"data": {
        "items": [{
            "id": str(subscription.id),
            "email": subscription.email,
            "status": subscription.status,
            "createdAt": subscription.created_at.isoformat(),
        } for subscription in rows],
        "total": total,
        "subscribedCount": subscribed_count,
        "limit": limit,
        "offset": offset,
    }}


@router.post("/newsletter/campaigns", response_model=dict, status_code=202)
async def queue_newsletter_campaign(
    payload: AdminNewsletterCampaignRequest,
    request: Request,
    response: Response,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-newsletter-campaign", 3, 3600)
    if not get_settings().contact_email_configured:
        raise HTTPException(503, "Configure the marketplace email sender before queueing a newsletter.")

    subscribers = (await db.scalars(
        select(NewsletterSubscription)
        .where(NewsletterSubscription.status == "subscribed")
        .order_by(NewsletterSubscription.id)
        .with_for_update()
    )).all()
    if not subscribers:
        raise HTTPException(409, "There are no subscribed newsletter addresses.")

    content_hash = hashlib.sha256(f"{payload.subject}\0{payload.body}".encode()).hexdigest()[:16]
    key_prefix = f"newsletter:{payload.idempotencyKey}:{content_hash}:"
    existing_keys = set((await db.scalars(
        select(EmailNotification.notification_key).where(
            EmailNotification.notification_key.like(f"{key_prefix}%")
        )
    )).all())
    queued_count = 0
    for subscription in subscribers:
        notification_key = f"{key_prefix}{subscription.id}"
        if notification_key in existing_keys:
            continue
        enqueue_email_notification(
            db,
            OutboxEvent(
                event_type="newsletter.campaign_queued",
                payload={"campaignId": str(payload.idempotencyKey), "subscriptionId": str(subscription.id)},
            ),
            template="newsletter_campaign",
            recipient=subscription.email,
            payload={
                "subject": payload.subject,
                "body": payload.body,
                "unsubscribeUrl": unsubscribe_url(subscription),
            },
            notification_key=notification_key,
        )
        queued_count += 1

    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, "This newsletter campaign is already being queued. Please refresh the subscriber list.") from error
    response.headers["Cache-Control"] = "no-store"
    return {"data": {
        "queued": queued_count,
        "recipientCount": len(subscribers),
        "alreadyQueued": queued_count == 0,
    }}


@router.get("/admins", response_model=dict)
async def list_admin_accounts(
    response: Response,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    accounts = (await db.scalars(
        select(Customer).where(Customer.role == "admin")
        .order_by(Customer.created_at.asc(), Customer.id.asc())
    )).all()
    return {"data": [{
        "id": str(account.id),
        "firstName": account.first_name,
        "lastName": account.last_name,
        "email": account.email,
        "emailVerified": account.email_verified,
        "createdAt": account.created_at.isoformat(),
    } for account in accounts]}


@router.post("/admins", response_model=dict, status_code=201)
async def create_admin_account(
    payload: AdminAccountCreateRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-account-create", 5, 60)
    email = str(payload.email).strip().lower()
    existing = await db.scalar(select(Customer.id).where(func.lower(Customer.email) == email))
    if existing is not None:
        raise HTTPException(409, "An account with this email already exists.")

    account = Customer(
        email=email,
        first_name=payload.firstName,
        last_name=payload.lastName,
        password_hash=hash_password(payload.password),
        email_verified=True,
        role="admin",
    )
    db.add(account)
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, "An account with this email already exists.") from error
    await db.refresh(account)
    return {"data": {
        "id": str(account.id),
        "firstName": account.first_name,
        "lastName": account.last_name,
        "email": account.email,
        "emailVerified": account.email_verified,
        "createdAt": account.created_at.isoformat(),
    }}


@router.patch("/admins/{admin_id}", response_model=dict)
async def update_admin_account(
    admin_id: UUID,
    payload: AdminAccountUpdateRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-account-update", 10, 60)
    account = await db.scalar(
        select(Customer)
        .where(Customer.id == admin_id, Customer.role == "admin")
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if account is None:
        raise HTTPException(404, "Admin account not found.")

    email = str(payload.email).strip().lower()
    existing = await db.scalar(select(Customer.id).where(
        func.lower(Customer.email) == email,
        Customer.id != account.id,
    ))
    if existing is not None:
        raise HTTPException(409, "An account with this email already exists.")

    credentials_changed = email != account.email.lower() or payload.password is not None
    account.first_name = payload.firstName
    account.last_name = payload.lastName
    account.email = email
    if payload.password is not None:
        account.password_hash = hash_password(payload.password)
    if credentials_changed:
        account.auth_version += 1
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(409, "An account with this email already exists.") from error
    await db.refresh(account)
    return {"data": {
        "id": str(account.id),
        "firstName": account.first_name,
        "lastName": account.last_name,
        "email": account.email,
        "emailVerified": account.email_verified,
        "createdAt": account.created_at.isoformat(),
    }}


@router.delete("/admins/{admin_id}", response_model=dict)
async def revoke_admin_access(
    admin_id: UUID,
    request: Request,
    current_admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-account-revoke", 10, 60)
    admins = (await db.scalars(
        select(Customer)
        .where(Customer.role == "admin")
        .order_by(Customer.id.asc())
        .with_for_update()
        .execution_options(populate_existing=True)
    )).all()
    admin_by_id = {account.id: account for account in admins}
    if current_admin.id not in admin_by_id:
        raise HTTPException(403, "Admin access is no longer active.")
    account = admin_by_id.get(admin_id)
    if account is None:
        raise HTTPException(404, "Admin account not found.")
    if account.id == current_admin.id:
        raise HTTPException(409, "You cannot revoke your own admin access.")
    if len(admins) <= 1:
        raise HTTPException(409, "The last admin account cannot be removed.")

    account.role = "customer"
    account.auth_version += 1
    await db.commit()
    return {"data": {"id": str(account.id), "role": account.role}}


@router.get("/email/inbox/status", response_model=dict)
async def get_email_inbox_status(
    response: Response,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    settings = get_settings()
    mailboxes = []
    for key, mailbox in settings.email_inbox_accounts.items():
        state_key = mailbox_sync_state_key(key, mailbox)
        state = await db.get(EmailInboxSyncState, state_key) if mailbox.username else None
        mailboxes.append({
            "key": key,
            "address": mailbox.address or mailbox.username,
            "imapConfigured": mailbox.imap_configured,
            "smtpConfigured": mailbox.smtp_configured,
            "lastSyncedAt": state.last_synced_at.isoformat() if state and state.last_synced_at else None,
            "lastError": state.last_error if state else None,
        })
    return {"data": {
        "imapConfigured": settings.email_inbox_imap_configured,
        "smtpConfigured": settings.email_inbox_reply_configured,
        "replyConfigured": settings.email_inbox_reply_configured,
        "mailboxes": mailboxes,
    }}


@router.post("/email/inbox/sync", response_model=dict)
async def sync_admin_email_inbox(
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-email-inbox-sync", 5, 60)
    imported_portal_messages = await sync_portal_messages(db)
    settings = get_settings()
    if not settings.email_inbox_imap_configured:
        return {"data": {
            "imapConfigured": False,
            "importedPortalMessages": imported_portal_messages,
            "importedMailboxMessages": 0,
            "mailboxes": [],
        }}
    result = await sync_mailbox_once(db)
    return {"data": {
        "imapConfigured": True,
        "importedPortalMessages": imported_portal_messages,
        "importedMailboxMessages": result["imported"],
        "mailboxes": [{
            **mailbox,
            "lastSyncedAt": mailbox["lastSyncedAt"].isoformat() if mailbox["lastSyncedAt"] else None,
        } for mailbox in result["mailboxes"]],
    }}


@router.get("/email/inbox", response_model=dict)
async def list_admin_email_threads(
    response: Response,
    q: str | None = Query(default=None, max_length=180),
    mailbox_key: str | None = Query(default=None, alias="mailboxKey", max_length=80),
    status: str = Query(default="all", pattern="^(all|unread|needs_reply|replied|pending|failed|archived)$"),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    await sync_portal_messages(db)
    thread_keys = None
    if q and q.strip():
        term = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{term}%"
        matching_keys = await db.scalars(select(EmailInboxMessage.thread_key).where(or_(
            EmailInboxMessage.subject.ilike(pattern, escape="\\"),
            EmailInboxMessage.from_email.ilike(pattern, escape="\\"),
            EmailInboxMessage.from_name.ilike(pattern, escape="\\"),
            EmailInboxMessage.text_body.ilike(pattern, escape="\\"),
        )).distinct().limit(5000))
        thread_keys = set(matching_keys)
    query = select(EmailInboxMessage)
    if thread_keys is not None:
        if not thread_keys:
            rows = []
        else:
            query = query.where(EmailInboxMessage.thread_key.in_(thread_keys))
            rows = (await db.scalars(
                query.order_by(EmailInboxMessage.received_at.desc(), EmailInboxMessage.id.desc()).limit(5000)
            )).all()
    else:
        rows = (await db.scalars(
            query.order_by(EmailInboxMessage.received_at.desc(), EmailInboxMessage.id.desc()).limit(5000)
        )).all()
    grouped: dict[str, list[EmailInboxMessage]] = {}
    for row in rows:
        grouped.setdefault(row.thread_key, []).append(row)
    threads = []
    settings = get_settings()
    for thread_key, messages in grouped.items():
        latest = messages[0]
        inbound = next((message for message in messages if message.direction == "inbound"), None)
        reply_status = "unreplied" if latest.direction == "inbound" else latest.delivery_status
        preview = " ".join(latest.text_body.split())[:220]
        unread_count = sum(
            1 for message in messages
            if message.direction == "inbound" and not message.is_read and message.archived_at is None
        )
        threads.append({
            "threadKey": thread_key,
            "subject": latest.subject,
            "fromEmail": inbound.from_email if inbound else latest.from_email,
            "fromName": inbound.from_name if inbound else latest.from_name,
            "latestAt": latest.received_at.isoformat(),
            "preview": preview,
            "messageCount": len(messages),
            "unreadCount": unread_count,
            "source": inbound.source_type if inbound else latest.source_type,
            "mailboxKey": email_mailbox_key(settings, inbound) if inbound else "other",
            "replyStatus": reply_status,
            "deliveryStatus": latest.delivery_status,
            "isArchived": all(message.archived_at is not None for message in messages),
        })
    counts_by_mailbox: dict[str, dict[str, int]] = {}
    summary = {"total": 0, "unread": 0, "needsReply": 0, "replied": 0, "pending": 0, "failed": 0, "archived": 0}
    for thread in threads:
        reply_status = thread["replyStatus"]
        counts = counts_by_mailbox.setdefault(thread["mailboxKey"], {
            "total": 0, "unread": 0, "needsReply": 0, "replied": 0, "pending": 0, "failed": 0, "archived": 0,
        })
        if thread["isArchived"]:
            summary["archived"] += 1
            counts["archived"] += 1
            continue
        summary["total"] += 1
        summary["unread"] += int(thread["unreadCount"] > 0)
        summary["needsReply"] += int(reply_status in {"unreplied", "failed"})
        summary["replied"] += int(reply_status == "sent")
        summary["pending"] += int(reply_status in {"queued", "sending"})
        summary["failed"] += int(reply_status == "failed")
        counts["total"] += 1
        counts["unread"] += int(thread["unreadCount"] > 0)
        counts["needsReply"] += int(reply_status in {"unreplied", "failed"})
        counts["replied"] += int(reply_status == "sent")
        counts["pending"] += int(reply_status in {"queued", "sending"})
        counts["failed"] += int(reply_status == "failed")

    filtered_threads = [
        thread for thread in threads
        if thread["isArchived"] == (status == "archived")
    ]
    if mailbox_key:
        filtered_threads = [thread for thread in filtered_threads if thread["mailboxKey"] == mailbox_key]
    if status == "unread":
        filtered_threads = [thread for thread in filtered_threads if thread["unreadCount"] > 0]
    elif status == "needs_reply":
        filtered_threads = [thread for thread in filtered_threads if thread["replyStatus"] in {"unreplied", "failed"}]
    elif status == "replied":
        filtered_threads = [thread for thread in filtered_threads if thread["replyStatus"] == "sent"]
    elif status == "pending":
        filtered_threads = [thread for thread in filtered_threads if thread["replyStatus"] in {"queued", "sending"}]
    elif status == "failed":
        filtered_threads = [thread for thread in filtered_threads if thread["replyStatus"] == "failed"]
    return {"data": {
        "items": filtered_threads[offset:offset + limit],
        "total": len(filtered_threads),
        "limit": limit,
        "offset": offset,
        "summary": {**summary, "byMailbox": counts_by_mailbox},
    }}


@router.get("/email/inbox/{thread_key}", response_model=dict)
async def get_admin_email_thread(
    response: Response,
    thread_key: str = Path(min_length=1, max_length=180),
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if response is not None:
        response.headers["Cache-Control"] = "no-store"
    await sync_portal_messages(db)
    await db.execute(
        update(EmailInboxMessage)
        .where(
            EmailInboxMessage.thread_key == thread_key,
            EmailInboxMessage.direction == "inbound",
            EmailInboxMessage.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
    rows = (await db.scalars(
        select(EmailInboxMessage)
        .where(EmailInboxMessage.thread_key == thread_key)
        .order_by(EmailInboxMessage.received_at, EmailInboxMessage.created_at, EmailInboxMessage.id)
    )).all()
    if not rows:
        raise HTTPException(404, "Email thread not found.")
    inbound = next((message for message in reversed(rows) if message.direction == "inbound"), None)
    reply_mailbox_key, reply_mailbox = (
        reply_mailbox_for(get_settings(), inbound) if inbound is not None else (None, None)
    )
    return {"data": {
        "threadKey": thread_key,
        "subject": rows[-1].subject,
        "isArchived": all(message.archived_at is not None for message in rows),
        "replyConfigured": bool(reply_mailbox and reply_mailbox.smtp_configured),
        "replyFrom": reply_mailbox.from_email if reply_mailbox and reply_mailbox.smtp_configured else None,
        "messages": [{
            "id": str(message.id),
            "direction": message.direction,
            "fromEmail": message.from_email,
            "fromName": message.from_name,
            "toEmail": message.to_email,
            "subject": message.subject,
            "body": message.text_body,
            "receivedAt": message.received_at.isoformat(),
            "deliveryStatus": message.delivery_status,
            "source": message.source_type,
        } for message in rows],
    }}


@router.patch("/email/inbox/{thread_key}/archive", response_model=dict)
async def set_admin_email_thread_archived(
    thread_key: str,
    payload: AdminEmailThreadArchiveRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-email-archive", 60, 60)
    if not thread_key or len(thread_key) > 180:
        raise HTTPException(404, "Email thread not found.")
    messages = (await db.scalars(
        select(EmailInboxMessage).where(EmailInboxMessage.thread_key == thread_key)
    )).all()
    if not messages:
        raise HTTPException(404, "Email thread not found.")
    archived_at = utc_now() if payload.archived else None
    for message in messages:
        message.archived_at = archived_at
    await db.commit()
    return {"data": {"threadKey": thread_key, "isArchived": payload.archived}}


@router.post("/email/inbox/{thread_key}/reply", response_model=dict)
async def reply_to_admin_email_thread(
    thread_key: str,
    payload: AdminEmailReplyRequest,
    request: Request,
    _admin: Customer = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-email-reply", 30, 60)
    settings = get_settings()
    if len(thread_key) > 180:
        raise HTTPException(404, "Email thread not found.")
    existing = await db.scalar(select(EmailInboxMessage).where(
        EmailInboxMessage.source_type == "admin_reply",
        EmailInboxMessage.source_key == str(payload.idempotencyKey),
    ))
    if existing is not None:
        return {"data": {
            "threadKey": existing.thread_key,
            "messageId": str(existing.id),
            "deliveryStatus": existing.delivery_status,
            "alreadyQueued": True,
        }}

    messages = (await db.scalars(
        select(EmailInboxMessage)
        .where(EmailInboxMessage.thread_key == thread_key)
        .order_by(EmailInboxMessage.received_at, EmailInboxMessage.created_at, EmailInboxMessage.id)
    )).all()
    if not messages:
        raise HTTPException(404, "Email thread not found.")
    inbound = next((message for message in reversed(messages) if message.direction == "inbound"), None)
    if inbound is None:
        raise HTTPException(400, "This thread has no incoming message to reply to.")
    try:
        recipient = str(TypeAdapter(EmailStr).validate_python(inbound.from_email))
    except ValidationError as error:
        raise HTTPException(400, "The sender address is not valid for a reply.") from error
    mailbox_key, mailbox = reply_mailbox_for(settings, inbound)
    if mailbox is None or not mailbox.smtp_configured:
        raise HTTPException(503, "The matching mailbox is not configured to send replies.")

    subject = " ".join(messages[0].subject.split())[:998]
    if not subject.casefold().startswith("re:"):
        subject = f"Re: {subject}"
    reference_ids = []
    for message in messages:
        if message.references_header:
            reference_ids.extend(MESSAGE_ID_PATTERN.findall(message.references_header))
        if message.message_id:
            reference_ids.append(message.message_id)
    references = " ".join(dict.fromkeys(reference_ids[-20:]))[-900:] or None
    in_reply_to = messages[-1].message_id or messages[-1].in_reply_to
    now = utc_now()
    event_id = uuid4()
    reply_id = uuid4()
    notification_key = f"{event_id}:admin_email_reply"
    reply = EmailInboxMessage(
        id=reply_id,
        thread_key=thread_key,
        source_type="admin_reply",
        source_key=str(payload.idempotencyKey),
        direction="outbound",
        from_email=mailbox.from_email,
        from_name="Ponyo",
        to_email=recipient,
        subject=subject[:998],
        text_body=payload.body,
        message_id=mailbox_message_id(notification_key),
        in_reply_to=in_reply_to,
        references_header=references,
        is_read=True,
        delivery_status="queued",
        received_at=now,
    )
    db.add(reply)
    event = OutboxEvent(
        id=event_id,
        event_type="admin.email_reply_queued",
        payload={"inboxMessageId": str(reply_id)},
    )
    try:
        db.add(event)
        await db.flush()
        enqueue_email_notification(
            db,
            event,
            template="admin_email_reply",
            recipient=recipient,
            payload={
                "idempotencyKey": str(payload.idempotencyKey),
                "subject": subject[:998],
                "body": payload.body,
                "mailboxKey": mailbox_key,
                "inReplyTo": in_reply_to,
                "references": references,
            },
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        existing = await db.scalar(select(EmailInboxMessage).where(
            EmailInboxMessage.source_type == "admin_reply",
            EmailInboxMessage.source_key == str(payload.idempotencyKey),
        ))
        if existing is None:
            original_error = error.orig
            logger.warning(
                "Admin email reply queue transaction failed error_type=%s sqlstate=%s constraint=%s",
                type(original_error).__name__,
                getattr(original_error, "sqlstate", getattr(original_error, "pgcode", None)),
                getattr(original_error, "constraint_name", None)
                or getattr(getattr(original_error, "diag", None), "constraint_name", None),
            )
            raise HTTPException(409, "The reply could not be queued. Please try again.") from error
        reply = existing
    return {"data": {
        "threadKey": reply.thread_key,
        "messageId": str(reply.id),
        "deliveryStatus": reply.delivery_status,
        "alreadyQueued": False,
    }}
