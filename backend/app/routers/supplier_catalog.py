"""Supplier-scoped updates for Ponyo-approved product offers and inventory."""

from datetime import datetime, timezone
import logging
import re
from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from app.config import settings
from app.db import get_db
from app.models import (
	Customer,
	MakerOnboarding,
	OutboxEvent,
	Product,
	ProductCategory,
	ProductVariant,
	Supplier,
	SupplierAccount,
	SupplierInventory,
	SupplierOfferChangeRequest,
	SupplierOffer,
	SupplierProductSubmission,
	utc_now,
)
from app.email_queue import enqueue_email_notification
from app.product_categories import PRODUCT_CATEGORY_SLUGS
from app.rate_limit import enforce_rate_limit
from app.schemas import SupplierOfferUpdate, SupplierProductSubmissionCreate
from app.security import get_authenticated_customer, require_csrf
from app.maker_application_storage import MAX_SOURCE_PHOTO_BYTES, normalize_maker_photo
from app.product_image_storage import (
	ProductImageStorageError,
	delete_product_images,
	upload_product_images,
)

router = APIRouter(prefix="/supplier-catalog", tags=["supplier catalog"])
logger = logging.getLogger(__name__)


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
	actor: Customer = Depends(get_authenticated_customer),
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
	actor: Customer = Depends(get_authenticated_customer),
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


@router.get("/product-submissions", response_model=dict)
async def list_product_submissions(
	actor: Customer = Depends(get_authenticated_customer),
	db: AsyncSession = Depends(get_db),
):
	supplier_id = await assigned_supplier_id(db, actor)
	rows = await db.scalars(
		select(SupplierProductSubmission)
		.where(SupplierProductSubmission.supplier_id == supplier_id)
		.order_by(SupplierProductSubmission.created_at.desc(), SupplierProductSubmission.id)
		.limit(100)
	)
	return {"data": [{
		"id": str(submission.id),
		"name": submission.name,
		"status": submission.status,
		"reviewNote": submission.review_note,
		"submittedAt": submission.submitted_at.isoformat(),
		"imageCount": len(submission.image_paths),
	} for submission in rows]}


@router.post("/product-submissions", response_model=dict, status_code=201)
async def submit_product(
	request: Request,
	actor: Customer = Depends(get_authenticated_customer),
	db: AsyncSession = Depends(get_db),
):
	require_csrf(request)
	await enforce_rate_limit(request, "supplier-product-submission", 10, 3600)
	supplier_id = await assigned_supplier_id(db, actor)
	form = await request.form(max_files=4, max_fields=30, max_part_size=MAX_SOURCE_PHOTO_BYTES)
	raw_data = {key: value for key, value in form.multi_items() if not isinstance(value, UploadFile)}
	for field in ("costAmount", "productionCapacity", "minimumOrderQuantity", "leadTimeDays"):
		value = str(raw_data.get(field, ""))
		if not re.fullmatch(r"[0-9]+", value):
			raise HTTPException(422, f"{field} must be a non-negative whole number.")
		raw_data[field] = int(value)
	try:
		payload = SupplierProductSubmissionCreate.model_validate(raw_data)
	except ValidationError as error:
		raise HTTPException(422, error.errors(include_url=False)) from error
	onboarding = await db.scalar(select(MakerOnboarding).where(
		MakerOnboarding.supplier_id == supplier_id,
		MakerOnboarding.status == "approved",
	))
	if onboarding is None or onboarding.brand_id is None:
		raise HTTPException(403, "Your account is not authorized to submit products for this brand.")
	category = await db.get(ProductCategory, payload.categoryId)
	if category is None or not category.active or category.slug not in PRODUCT_CATEGORY_SLUGS:
		raise HTTPException(422, "Choose an active product category.")
	child_category = await db.scalar(
		select(ProductCategory.id).where(ProductCategory.parent_id == category.id).limit(1)
	)
	if child_category:
		raise HTTPException(422, "Choose a specific product category, not a parent category.")
	files = [value for _, value in form.multi_items() if isinstance(value, UploadFile) and value.filename]
	if not 1 <= len(files) <= 4:
		raise HTTPException(422, "Upload between one and four product photos.")
	images: list[bytes] = []
	for photo in files:
		content = await photo.read(MAX_SOURCE_PHOTO_BYTES + 1)
		if len(content) > MAX_SOURCE_PHOTO_BYTES:
			raise HTTPException(413, "Each product photo must be 5 MB or smaller.")
		try:
			images.append(normalize_maker_photo(content, photo.content_type or ""))
		except ValueError as error:
			raise HTTPException(422, str(error)) from error
	if not settings.contact_email_configured:
		raise HTTPException(503, "Transactional email is not configured.")
	if not settings.product_image_storage_configured:
		raise HTTPException(503, "Product image storage is not configured.")
	submission_id = uuid4()
	try:
		image_paths = await upload_product_images(submission_id, images)
	except ProductImageStorageError as error:
		raise HTTPException(503, "Product image storage is temporarily unavailable.") from error
	submission = SupplierProductSubmission(
		id=submission_id,
		supplier_id=supplier_id,
		brand_id=onboarding.brand_id,
		category_id=payload.categoryId,
		name=payload.name,
		description=payload.description,
		materials=payload.materials,
		currency=payload.currency,
		cost_amount=payload.costAmount,
		production_capacity=payload.productionCapacity,
		minimum_order_quantity=payload.minimumOrderQuantity,
		lead_time_days=payload.leadTimeDays,
		product_type=payload.productType,
		size_tier=payload.sizeTier,
		dimensions=payload.dimensions,
		image_paths=image_paths,
		status="submitted",
		submitted_at=utc_now(),
	)
	db.add(submission)
	supplier = await db.get(Supplier, supplier_id)
	if supplier is None:
		raise HTTPException(409, "Your supplier account is no longer available.")
	enqueue_email_notification(
		db,
		OutboxEvent(
			event_type="supplier.product_submission_review_requested",
			payload={"submissionId": str(submission.id), "supplierId": str(supplier.id)},
		),
		template="supplier_product_review_requested",
		recipient=settings.partners_notification_email,
		payload={
			"makerName": supplier.name,
			"productName": submission.name,
			"reviewUrl": f"{settings.storefront_base_url.rstrip('/')}/admin-portal",
		},
		notification_key=f"supplier_product_review:{submission.id}",
	)
	try:
		await db.commit()
	except SQLAlchemyError as error:
		await db.rollback()
		try:
			await delete_product_images(image_paths)
		except ProductImageStorageError:
			logger.exception("Could not clean up rejected product submission images.")
		logger.exception("Could not save supplier product submission.")
		raise HTTPException(503, "The product submission could not be saved. Please try again.") from error
	return {"data": {"id": str(submission.id), "name": submission.name, "status": submission.status}}