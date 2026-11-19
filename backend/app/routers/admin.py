"""Admin-only marketplace operations and read models for the Ponyo dashboard."""

import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO
from uuid import UUID

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import (
    Brand,
    Customer,
    MakerApplication,
    Order,
    OrderItem,
    OutboxEvent,
    Product,
    ProductCategory,
    ProductInterest,
    ProductReservation,
    ProductTranslation,
    ProductVariant,
    Shipment,
    Supplier,
    SupplierAccount,
    SupplierOffer,
    SupplierPurchaseOrder,
    SupplierPurchaseOrderItem,
    utc_now,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import (
    AdminAccountCreateRequest,
    AdminBrandProfileRequest,
    AdminMakerApplicationStatusRequest,
    AdminProductProofRequest,
    AdminProductPublicationRequest,
    AdminProductReservationSettings,
    AdminSupplierStatusRequest,
)
from app.security import hash_password, require_csrf, require_roles
from app.translations import TranslationUnavailableError, ensure_product_translations, source_hash

router = APIRouter(prefix="/admin", tags=["admin marketplace operations"])

MAX_RESERVATION_EXPORT_ROWS = 10_000


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
        "revenueByCurrency": [{"currency": currency, "amount": amount or 0} for currency, amount in revenue_rows],
        "ordersByStatus": [{"status": status, "count": count} for status, count in order_statuses],
        "recentOrders": [order_summary(order) for order in recent_orders],
        "unpublishedProducts": [product_summary(product) for product in recent_products],
        "suppliers": [{"id": str(supplier.id), "code": supplier.code, "name": supplier.name,
                       "active": supplier.active, "accountCount": account_count} for supplier, account_count in suppliers],
        "notice": "Supplier applications and sales history require dedicated workflows; no application or time-series sales records are currently stored.",
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
    product.reservations_open = payload.reservationsOpen
    product.reservation_target = payload.reservationTarget
    if payload.reservationTarget is None or reservation_count < payload.reservationTarget:
        product.reservation_minimum_reached_at = None
    elif product.reservation_minimum_reached_at is None:
        product.reservation_minimum_reached_at = utc_now()
        db.add(OutboxEvent(event_type="product.reservation_minimum_reached", payload={
            "productId": str(product.id),
            "productName": product.name,
            "reservationCount": reservation_count,
            "target": payload.reservationTarget,
        }))
    await db.commit()
    return {"data": {
        "id": str(product.id),
        "reservationsOpen": product.reservations_open,
        "reservationTarget": product.reservation_target,
        "reservationMinimumReachedAt": (
            product.reservation_minimum_reached_at.isoformat()
            if product.reservation_minimum_reached_at else None
        ),
    }}


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
    return {"data": [{
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
        "productPhotos": application.product_photos,
        "ponyoExclusivity": application.ponyo_exclusivity,
        "status": application.status,
        "createdAt": application.created_at.isoformat(),
    } for application in applications]}


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
    q: str | None = Query(default=None, max_length=120), limit: int = Query(default=100, ge=1, le=200),
):
    query = select(Customer).where(Customer.role == "customer")
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(Customer.email.ilike(term), Customer.first_name.ilike(term), Customer.last_name.ilike(term)))
    rows = (await db.scalars(query.order_by(Customer.created_at.desc(), Customer.id).limit(limit))).all()
    return {"data": [{"id": str(customer.id), "firstName": customer.first_name, "lastName": customer.last_name,
                       "email": customer.email, "emailVerified": customer.email_verified,
                       "createdAt": customer.created_at.isoformat()} for customer in rows]}


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
