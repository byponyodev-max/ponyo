"""Supplier-scoped updates for Ponyo-approved product offers and inventory."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import (
	Customer,
	Product,
	ProductVariant,
	Supplier,
	SupplierAccount,
	SupplierInventory,
	SupplierOfferChangeRequest,
	SupplierOffer,
)
from app.rate_limit import enforce_rate_limit
from app.schemas import SupplierOfferUpdate
from app.security import require_csrf, require_roles

router = APIRouter(prefix="/supplier-catalog", tags=["supplier catalog"])


async def assigned_supplier_id(db: AsyncSession, actor: Customer) -> UUID:
	binding = await db.get(SupplierAccount, actor.id)
	supplier = await db.get(Supplier, binding.supplier_id) if binding else None
	if not supplier or not supplier.active:
		raise HTTPException(403, "Your account has no active supplier assignment.")
	return supplier.id


def offer_payload(
	offer: SupplierOffer,
	inventory: SupplierInventory,
	variant: ProductVariant,
	product: Product,
	pending_change: SupplierOfferChangeRequest | None = None,
) -> dict:
	return {
		"offerId": str(offer.id),
		"productId": str(product.id),
		"variantId": str(variant.id),
		"productName": product.name,
		"variantTitle": variant.title,
		"variantSku": variant.sku,
		"retailPriceAmount": variant.price_amount,
		"currency": variant.currency,
		"isPrimary": offer.is_primary,
		"supplierSku": offer.supplier_sku,
		"costAmount": offer.cost_amount,
		"minimumOrderQuantity": offer.minimum_order_quantity,
		"leadTimeDays": offer.lead_time_days,
		"onHand": inventory.on_hand,
		"reserved": inventory.reserved,
		"availableQuantity": max(0, inventory.on_hand - inventory.reserved),
		"active": offer.active,
		"pendingChange": ({
			"productionCapacity": pending_change.production_capacity,
			"costAmount": pending_change.cost_amount,
			"minimumOrderQuantity": pending_change.minimum_order_quantity,
			"leadTimeDays": pending_change.lead_time_days,
			"submittedAt": pending_change.submitted_at.isoformat(),
		} if pending_change else None),
	}


async def supplier_offers_query(db: AsyncSession, supplier_id: UUID, limit: int):
	return (await db.execute(
		select(SupplierOffer, SupplierInventory, ProductVariant, Product)
		.join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
		.join(ProductVariant, ProductVariant.id == SupplierOffer.variant_id)
		.join(Product, Product.id == ProductVariant.product_id)
		.where(
			SupplierOffer.supplier_id == supplier_id,
			Product.published.is_(True),
			ProductVariant.active.is_(True),
		)
		.order_by(Product.name, ProductVariant.title, SupplierOffer.id)
		.limit(limit)
	)).all()


@router.get("/offers", response_model=dict)
async def list_supplier_offers(
	actor: Customer = Depends(require_roles("supplier")),
	db: AsyncSession = Depends(get_db),
	limit: int = Query(default=100, ge=1, le=100),
):
	supplier_id = await assigned_supplier_id(db, actor)
	rows = await supplier_offers_query(db, supplier_id, limit)
	offer_ids = [row[0].id for row in rows]
	pending_changes = (await db.scalars(
		select(SupplierOfferChangeRequest)
		.where(
			SupplierOfferChangeRequest.offer_id.in_(offer_ids),
			SupplierOfferChangeRequest.status == "pending",
		)
		.order_by(SupplierOfferChangeRequest.submitted_at.desc(), SupplierOfferChangeRequest.id.desc())
	)).all() if offer_ids else []
	pending_by_offer = {}
	for change in pending_changes:
		pending_by_offer.setdefault(change.offer_id, change)
	return {"data": [
		offer_payload(*row, pending_by_offer.get(row[0].id))
		for row in rows
	]}


@router.patch("/offers/{offer_id}", response_model=dict)
async def update_supplier_offer(
	offer_id: UUID,
	payload: SupplierOfferUpdate,
	request: Request,
	actor: Customer = Depends(require_roles("supplier")),
	db: AsyncSession = Depends(get_db),
):
	require_csrf(request)
	await enforce_rate_limit(request, "supplier-catalog-update", 30, 60)
	supplier_id = await assigned_supplier_id(db, actor)

	# Discover the variant first, then lock it before locking offer/inventory rows.
	variant_id = await db.scalar(select(SupplierOffer.variant_id).where(
		SupplierOffer.id == offer_id,
		SupplierOffer.supplier_id == supplier_id,
	))
	if variant_id is None:
		raise HTTPException(404, "Approved supplier listing not found.")
	variant = await db.scalar(select(ProductVariant).where(
		ProductVariant.id == variant_id,
	).with_for_update().execution_options(populate_existing=True))
	row = await db.execute(
		select(SupplierOffer, SupplierInventory)
		.join(SupplierInventory, SupplierInventory.offer_id == SupplierOffer.id)
		.where(SupplierOffer.id == offer_id, SupplierOffer.supplier_id == supplier_id)
		.with_for_update()
		.execution_options(populate_existing=True)
	)
	locked = row.first()
	if variant is None or locked is None:
		raise HTTPException(404, "Approved supplier listing not found.")
	offer, inventory = locked
	if offer.variant_id != variant.id:
		raise HTTPException(409, "Supplier listing changed. Refresh and try again.")
	product = await db.get(Product, variant.product_id)
	if not product or not product.published or not variant.active:
		raise HTTPException(404, "Approved supplier listing not found.")
	if payload.productionCapacity < inventory.reserved:
		raise HTTPException(409, {
			"code": "stock_below_reserved",
			"message": "Production capacity cannot be lower than units already reserved for orders.",
		})
	if offer.currency != variant.currency:
		raise HTTPException(409, "Offer currency must match the approved product variant.")

	pending = await db.scalar(select(SupplierOfferChangeRequest).where(
		SupplierOfferChangeRequest.offer_id == offer.id,
		SupplierOfferChangeRequest.status == "pending",
	).order_by(SupplierOfferChangeRequest.submitted_at.desc()).with_for_update())
	if pending is None:
		pending = SupplierOfferChangeRequest(
			supplier_id=supplier_id,
			offer_id=offer.id,
			production_capacity=payload.productionCapacity,
			cost_amount=payload.costAmount,
			minimum_order_quantity=payload.minimumOrderQuantity,
			lead_time_days=payload.leadTimeDays,
		)
		db.add(pending)
	else:
		pending.production_capacity = payload.productionCapacity
		pending.cost_amount = payload.costAmount
		pending.minimum_order_quantity = payload.minimumOrderQuantity
		pending.lead_time_days = payload.leadTimeDays
		pending.submitted_at = datetime.now(timezone.utc)
	await db.commit()
	return {"data": offer_payload(offer, inventory, variant, product, pending)}