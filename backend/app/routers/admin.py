"""Admin-only marketplace operations and read models for the Ponyo dashboard."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import (
    Brand,
    Customer,
    Order,
    OrderItem,
    Product,
    ProductCategory,
    ProductVariant,
    Shipment,
    Supplier,
    SupplierAccount,
    SupplierOffer,
    SupplierPurchaseOrder,
    SupplierPurchaseOrderItem,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import AdminProductPublicationRequest, AdminSupplierStatusRequest
from app.security import require_csrf, require_roles

router = APIRouter(prefix="/admin", tags=["admin marketplace operations"])


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
    product.published = published
    await db.commit()
    await db.refresh(product)
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
                       "isDemo": brand.is_demo, "productCount": product_count}
                      for brand, product_count in rows]}


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
