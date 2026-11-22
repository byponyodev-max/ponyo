from uuid import UUID
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.media import storefront_image_url
from app.models import Brand, Customer, Order, OrderItem, OutboxEvent, Product, ProductCategory, ProductInterest, ProductReservation, ProductReview, ProductTranslation, ProductVariant, ProductWaitlistEntry, utc_now
from app.catalog_stock import available_quantities, sellable_variant
from app.schemas import ProductInterestRequest, ProductOut, ProductReservationRequest, ProductReviewCreate, ProductWaitlistRequest, VariantOut
from app.security import get_current_customer, get_optional_customer, require_csrf
from app.rate_limit import enforce_rate_limit
from app.translations import TRANSLATION_LOCALES, TranslationUnavailableError, get_product_translation
from app.translations import _get_nested
from app.shipping import shipping_country_code

router = APIRouter(prefix="/products", tags=["catalog"])


async def product_by_id(product_id: UUID, db: AsyncSession) -> Product:
    product = await db.scalar(
        select(Product).where(Product.id == product_id, Product.published.is_(True))
        .options(selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    return product


def product_response(product: Product, translation: ProductTranslation | None = None, quantities: dict | None = None) -> ProductOut:
    translated_fields = translation.fields if translation and translation.fields else {}
    has_maker_profile = bool(product.brand and product.brand.maker_story)

    def localized(path: tuple[str, ...], fallback):
        value = _get_nested(translated_fields, path)
        return value if isinstance(value, str) and value else fallback

    variants = [
        VariantOut(
            id=str(variant.id),
            sku=variant.sku,
            title=localized(("variants", str(variant.id), "title"), variant.title),
            priceAmount=variant.price_amount,
            currency=variant.currency,
            compareAtAmount=variant.compare_at_amount,
            availability="available" if (quantities.get(variant.id, 0) if quantities is not None else variant.stock_quantity) > 0 else "unavailable",
            options={
                localized(("variants", str(variant.id), "options", str(index), "key"), key):
                localized(("variants", str(variant.id), "options", str(index), "value"), value)
                for index, (key, value) in enumerate(sorted((variant.options or {}).items()))
            },
        )
        for variant in product.variants
        if variant.active
    ]
    default_variant = next((variant for variant in variants if variant.availability == "available"), variants[0] if variants else None)
    availability = "available" if default_variant and default_variant.availability == "available" else "unavailable"
    return ProductOut(
        id=str(product.id),
        sku=product.sku,
        slug=product.slug,
        name=translation.name if translation else product.name,
        description=translation.description if translation else product.description,
        priceAmount=default_variant.priceAmount if default_variant else product.price_amount,
        compareAtAmount=default_variant.compareAtAmount if default_variant else product.compare_at_amount,
        currency=default_variant.currency if default_variant else product.currency,
        availability=availability,
        availabilityStatus="Coming Soon" if not product.checkout_enabled else product.availability_status,
        categoryName=localized(("categoryName",), product.category.name if product.category else product.category_name),
        categoryId=str(product.category_id) if product.category_id else None,
        categorySlug=product.category.slug if product.category else None,
        brandId=str(product.brand_id) if product.brand_id else None,
        brandName=product.brand.name if product.brand else product.supplier_name,
        makerName=product.brand.name if has_maker_profile else None,
        makerSlug=product.brand.slug if has_maker_profile else None,
        makerStory=localized(("makerStory",), product.brand.maker_story) if has_maker_profile else None,
        makerPhilosophy=localized(("makerPhilosophy",), product.brand.philosophy) if has_maker_profile else None,
        makerProcess=localized(("makerProcess",), product.brand.process) if has_maker_profile else None,
        makerLocation=localized(("makerLocation",), product.brand.location) if has_maker_profile else None,
        makerSpecialties=[
            localized(("makerSpecialties", str(index)), specialty)
            for index, specialty in enumerate(product.brand.specialties or [])
        ] if has_maker_profile else [],
        materials=localized(("materials",), product.materials),
        weightGrams=product.weight_grams,
        editionCount=product.edition_count,
        estimatedDeliveryDate=product.estimated_delivery_date,
        onlyAtPonyo=product.only_at_ponyo,
        reservationsOpen=product.reservations_open,
        reservationTarget=product.reservation_target,
        reservationDeadline=product.reservation_deadline,
        productionStatus=product.production_status,
        shippingCountries=product.shipping_countries,
        images=[{"url": storefront_image_url(image.url), "alt": localized(("imageAlts", str(image.id)), image.alt)} for image in product.images],
        galleryImages=[{"src": storefront_image_url(image.url), "alt": localized(("imageAlts", str(image.id)), image.alt)} for image in product.images],
        productType=localized(("productType",), product.product_type),
        supplierName=product.brand.name if product.brand else product.supplier_name,
        image=storefront_image_url(product.images[0].url if product.images else product.image_url),
        imageAlt=localized(("imageAlts", str(product.images[0].id)), product.images[0].alt) if product.images else localized(("imageAlt",), product.image_alt),
        tags=product.tags or [],
        sizeTier=localized(("sizeTier",), product.size_tier),
        dimensions=localized(("dimensions",), product.dimensions),
        dispatchTime=localized(("dispatchTime",), product.dispatch_time),
        variantId=str(default_variant.id) if default_variant else None,
        variants=variants,
    )


@router.get("", response_model=dict)
async def list_products(
    q: str | None = Query(default=None, max_length=120),
    category: str | None = None,
    brand: str | None = None,
    category_id: UUID | None = None,
    brand_id: UUID | None = None,
    availability: Literal["available", "unavailable"] | None = None,
    min_price: int | None = Query(default=None, ge=0),
    max_price: int | None = Query(default=None, ge=0),
    size: str | None = None,
    sort: str = "best-selling",
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=100),
    locale: str = Query(default="en", min_length=2, max_length=12),
    db: AsyncSession = Depends(get_db),
):
    if locale not in {"en", *TRANSLATION_LOCALES}:
        raise HTTPException(422, "Unsupported product locale.")
    query = select(Product).where(Product.published.is_(True)).options(selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
    if q:
        term = f"%{q.strip()}%"
        translated_match = select(ProductTranslation.id).where(
            ProductTranslation.product_id == Product.id, ProductTranslation.locale == locale,
            or_(ProductTranslation.name.ilike(term), ProductTranslation.description.ilike(term)),
        ).exists() if locale != "en" else False
        query = query.where(or_(Product.name.ilike(term), Product.description.ilike(term), Product.category_name.ilike(term), Product.sku.ilike(term), Product.brand.has(Brand.name.ilike(term)), translated_match))
    if category:
        category_term = category.strip()
        selected_category = select(ProductCategory.id).where(
            or_(ProductCategory.slug == category_term, ProductCategory.name.ilike(category_term)),
            ProductCategory.active.is_(True),
        )
        child_category_ids = select(ProductCategory.id).where(
            ProductCategory.parent_id.in_(selected_category),
            ProductCategory.active.is_(True),
        )
        query = query.where(or_(
            Product.category_name.ilike(category_term),
            Product.category_id.in_(selected_category),
            Product.category_id.in_(child_category_ids),
        ))
    if brand:
        query = query.where(Product.brand.has(or_(Brand.slug == brand.strip(), Brand.name.ilike(brand.strip()))))
    if category_id:
        query = query.where(Product.category_id == category_id)
    if brand_id:
        query = query.where(Product.brand_id == brand_id)
    in_stock = select(ProductVariant.id).where(ProductVariant.product_id == Product.id, sellable_variant()).correlate(Product).exists()
    if availability:
        query = query.where(in_stock if availability == "available" else ~in_stock)
    if min_price is not None and max_price is not None and min_price > max_price:
        raise HTTPException(422, "Minimum price must not exceed maximum price.")
    if size:
        query = query.where(Product.size_tier.ilike(size.strip()))
    variant_price = select(func.min(ProductVariant.price_amount)).where(
        ProductVariant.product_id == Product.id,
        sellable_variant(),
    ).correlate(Product).scalar_subquery()
    if min_price is not None or max_price is not None:
        price_conditions = [sellable_variant()]
        if min_price is not None:
            price_conditions.append(ProductVariant.price_amount >= min_price)
        if max_price is not None:
            price_conditions.append(ProductVariant.price_amount <= max_price)
        eligible_product = select(ProductVariant.id).where(
            ProductVariant.product_id == Product.id,
            *price_conditions,
        ).exists()
        query = query.where(eligible_product)

    sort_columns = {
        "price-ascending": variant_price.asc().nulls_last(),
        "price-descending": variant_price.desc().nulls_last(),
        "title-descending": Product.name.desc(),
        "title-ascending": Product.name.asc(),
        "created-ascending": Product.created_at.asc(),
        "newest": Product.created_at.desc(),
        "available-first": in_stock.desc(),
        "created-descending": Product.created_at.desc(),
        # Until paid order analytics are populated, newest is the deterministic merchandising fallback.
        "best-selling": Product.created_at.desc(),
    }
    query = query.order_by(sort_columns.get(sort, Product.name.asc()), Product.id.asc())
    count_query = select(func.count()).select_from(query.order_by(None).subquery())
    total = int(await db.scalar(count_query) or 0)
    rows = (await db.scalars(query.offset((page - 1) * limit).limit(limit))).all()
    data = []
    quantities = await available_quantities(db, [variant for product in rows for variant in product.variants])
    for product in rows:
        try:
            translation = await get_product_translation(product, locale, db) if locale != "en" else None
        except TranslationUnavailableError as error:
            raise HTTPException(503, "Product translation is unavailable.") from error
        data.append(product_response(product, translation, quantities).model_dump(mode="json"))
    if locale != "en":
        await db.commit()
    return {"data": data, "page": page, "limit": limit, "total": total}


@router.get("/{product_id}", response_model=dict)
async def get_product(
    product_id: str,
    locale: str = Query(default="en", min_length=2, max_length=12),
    db: AsyncSession = Depends(get_db),
):
    if locale not in {"en", *TRANSLATION_LOCALES}:
        raise HTTPException(422, "Unsupported product locale.")
    try:
        identifier = UUID(product_id)
        product_filter = Product.id == identifier
    except ValueError:
        # Accept legacy product handles so storefront routes can redirect old links to canonical IDs.
        product_filter = Product.slug == product_id
    product = await db.scalar(
        select(Product).where(product_filter, Product.published.is_(True)).options(selectinload(Product.variants), selectinload(Product.category), selectinload(Product.brand), selectinload(Product.images))
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    try:
        translation = await get_product_translation(product, locale, db) if locale != "en" else None
    except TranslationUnavailableError as error:
        raise HTTPException(503, "Product translation is unavailable.") from error
    if translation:
        await db.commit()
    return {"data": product_response(
        product,
        translation,
        await available_quantities(db, product.variants),
    ).model_dump(mode="json")}


async def catalog_product(identifier: str, db: AsyncSession) -> Product:
    try:
        condition = Product.id == UUID(identifier)
    except ValueError:
        condition = Product.slug == identifier
    product = await db.scalar(select(Product).where(condition, Product.published.is_(True)).options(
        selectinload(Product.variants), selectinload(Product.images), selectinload(Product.brand), selectinload(Product.category),
    ))
    if not product:
        raise HTTPException(404, "Product not found.")
    return product


@router.get("/{product_id}/variants")
async def list_product_variants(product_id: str, db: AsyncSession = Depends(get_db)):
    product = await catalog_product(product_id, db)
    data = product_response(product, quantities=await available_quantities(db, product.variants))
    return {"data": [variant.model_dump(mode="json") for variant in data.variants]}


@router.get("/{product_id}/variants/{variant_id}")
async def get_product_variant(product_id: str, variant_id: UUID, db: AsyncSession = Depends(get_db)):
    product = await catalog_product(product_id, db)
    data = product_response(product, quantities=await available_quantities(db, product.variants))
    variant = next((variant for variant in data.variants if variant.id == str(variant_id)), None)
    if variant is None:
        raise HTTPException(404, "Product variant not found.")
    return {"data": variant.model_dump(mode="json")}


@router.get("/{product_id}/images")
async def get_product_images(product_id: str, db: AsyncSession = Depends(get_db)):
    product = await catalog_product(product_id, db)
    images = [{"id": str(image.id), "url": storefront_image_url(image.url), "alt": image.alt, "position": image.sort_order} for image in product.images]
    if not images:
        images = [{"id": None, "url": storefront_image_url(product.image_url), "alt": product.image_alt, "position": 0}]
    return {"data": images}


@router.get("/{product_id}/availability")
async def get_product_availability(product_id: str, db: AsyncSession = Depends(get_db)):
    product = await catalog_product(product_id, db)
    quantities = await available_quantities(db, product.variants)
    return {"data": {
        "productId": str(product.id), "availability": "available" if any(quantities.values()) else "unavailable",
        "availabilityStatus": product.availability_status,
        "variants": [{"variantId": str(variant.id), "availability": "available" if quantities.get(variant.id, 0) > 0 else "unavailable", "availableQuantity": quantities.get(variant.id, 0)} for variant in product.variants if variant.active],
    }}


@router.get("/{product_id}/reviews", response_model=dict)
async def list_product_reviews(product_id: UUID, db: AsyncSession = Depends(get_db)):
    await product_by_id(product_id, db)
    reviews = await db.scalars(
        select(ProductReview).where(ProductReview.product_id == product_id, ProductReview.published.is_(True))
        .order_by(ProductReview.created_at.desc()).limit(100)
    )
    rows = list(reviews)
    review_count = int(await db.scalar(
        select(func.count(ProductReview.id)).where(ProductReview.product_id == product_id, ProductReview.published.is_(True))
    ) or 0)
    average = float(await db.scalar(
        select(func.avg(ProductReview.rating)).where(ProductReview.product_id == product_id, ProductReview.published.is_(True))
    ) or 0)
    return {"data": {
        "averageRating": round(average, 1),
        "reviewCount": review_count,
        "reviews": [{
            "id": str(review.id), "reviewerName": review.reviewer_name,
            "rating": review.rating, "title": review.title, "body": review.body,
            "photos": review.photos or [],
            "verifiedPurchase": review.verified_purchase, "createdAt": review.created_at.isoformat(),
        } for review in rows],
    }}


@router.post("/{product_id}/reviews", response_model=dict)
async def create_product_review(
    product_id: UUID,
    payload: ProductReviewCreate,
    request: Request,
    customer: Customer = Depends(get_current_customer),
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "product-review", 5, 3600)
    await product_by_id(product_id, db)
    review = await db.scalar(select(ProductReview).where(
        ProductReview.product_id == product_id,
        ProductReview.customer_id == customer.id,
    ))
    if not review:
        verified_purchase = bool(await db.scalar(
            select(OrderItem.id)
            .join(Order, Order.id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
            .where(
                Order.customer_id == customer.id,
                ProductVariant.product_id == product_id,
                Order.payment_status == "paid",
            ).limit(1)
        ))
        review = ProductReview(
            product_id=product_id,
            customer_id=customer.id,
            reviewer_name=customer.first_name.strip() or "Ponyo customer",
            verified_purchase=verified_purchase,
        )
        db.add(review)
    review.rating = payload.rating
    review.title = payload.title.strip()
    review.body = payload.body.strip()
    review.photos = payload.photos
    review.reviewer_name = customer.first_name.strip() or "Ponyo customer"
    review.published = True
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Your review could not be saved. Please try again.") from None
    await db.refresh(review)
    return {"data": {
        "id": str(review.id), "reviewerName": review.reviewer_name,
        "rating": review.rating, "title": review.title, "body": review.body,
        "photos": review.photos or [],
        "verifiedPurchase": review.verified_purchase, "createdAt": review.created_at.isoformat(),
    }}


@router.get("/{product_id}/reservations", response_model=dict)
async def get_product_reservations(product_id: UUID, db: AsyncSession = Depends(get_db)):
    product = await product_by_id(product_id, db)
    count = await db.scalar(select(func.count()).select_from(ProductReservation).where(
        ProductReservation.product_id == product.id,
    )) or 0
    return {"data": {
        "reservationCount": count,
        "target": product.reservation_target,
        "open": product.reservations_open,
        "deadline": product.reservation_deadline.isoformat() if product.reservation_deadline else None,
        "productionStatus": product.production_status,
    }}


@router.post("/{product_id}/reservations", response_model=dict)
async def create_product_reservation(
    product_id: UUID,
    payload: ProductReservationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "product-reservation", 10, 3600)
    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id, Product.published.is_(True))
        .with_for_update()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    email = str(payload.email).lower().strip()
    existing = await db.scalar(select(ProductReservation.id).where(
        ProductReservation.product_id == product.id,
        ProductReservation.email == email,
    ))
    if existing is not None:
        count = await db.scalar(select(func.count()).select_from(ProductReservation).where(
            ProductReservation.product_id == product.id,
        )) or 0
        return {"data": {
            "accepted": True,
            "reservationCount": count,
            "target": product.reservation_target,
            "open": product.reservations_open,
            "deadline": product.reservation_deadline.isoformat() if product.reservation_deadline else None,
            "productionStatus": product.production_status,
        }}
    if not product.reservations_open:
        raise HTTPException(status_code=409, detail="Reservations are not open for this product.")
    if product.reservation_deadline is not None and product.reservation_deadline < utc_now().date():
        raise HTTPException(status_code=409, detail="The reservation period has ended.")
    country_code = shipping_country_code(payload.country)
    if product.shipping_countries is None or country_code not in product.shipping_countries:
        raise HTTPException(
            status_code=409,
            detail="This product cannot be reserved for the selected country. Register your interest instead.",
        )

    reservation_target = product.reservation_target
    product_name = product.name
    try:
        db.add(ProductReservation(
            product_id=product.id,
            email=email,
            country=country_code,
        ))
        db.add(OutboxEvent(event_type="product.reservation_created", payload={
            "productId": str(product.id), "productName": product.name, "email": email,
        }))
        await db.flush()
        count = await db.scalar(select(func.count()).select_from(ProductReservation).where(
            ProductReservation.product_id == product.id,
        )) or 0
        if (
            reservation_target is not None
            and count >= reservation_target
            and product.reservation_minimum_reached_at is None
        ):
            product.reservation_minimum_reached_at = utc_now()
            product.reservations_open = False
            product.production_status = "target_reached"
            db.add(OutboxEvent(event_type="product.reservation_minimum_reached", payload={
                "productId": str(product.id),
                "productName": product_name,
                "reservationCount": count,
                "target": reservation_target,
            }))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        duplicate = await db.scalar(select(ProductReservation.id).where(
            ProductReservation.product_id == product_id,
            ProductReservation.email == email,
        ))
        if duplicate is None:
            raise
        product = await db.get(Product, product_id)
        if product is None:
            raise HTTPException(status_code=404, detail="Product not found.")

    count = await db.scalar(select(func.count()).select_from(ProductReservation).where(
        ProductReservation.product_id == product_id,
    )) or 0
    return {"data": {
        "accepted": True,
        "reservationCount": count,
        "target": reservation_target,
        "open": product.reservations_open,
        "deadline": product.reservation_deadline.isoformat() if product.reservation_deadline else None,
        "productionStatus": product.production_status,
    }}


@router.post("/{product_id}/interests", response_model=dict)
async def register_product_interest(
    product_id: UUID,
    payload: ProductInterestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "product-interest", 10, 3600)
    product = await db.scalar(
        select(Product)
        .where(Product.id == product_id, Product.published.is_(True))
        .with_for_update()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")

    country_code = shipping_country_code(payload.country)
    if country_code and product.shipping_countries and country_code in product.shipping_countries:
        raise HTTPException(
            status_code=409,
            detail="This product ships to the selected country. Reserve a spot instead.",
        )

    email = str(payload.email).lower().strip()
    country = country_code or payload.country.strip()
    existing = await db.scalar(select(ProductInterest.id).where(
        ProductInterest.product_id == product.id,
        ProductInterest.email == email,
        ProductInterest.country == country,
    ))
    if existing is None:
        try:
            db.add(ProductInterest(product_id=product.id, email=email, country=country))
            await db.commit()
        except IntegrityError:
            await db.rollback()
            duplicate = await db.scalar(select(ProductInterest.id).where(
                ProductInterest.product_id == product_id,
                ProductInterest.email == email,
                ProductInterest.country == country,
            ))
            if duplicate is None:
                raise

    count = await db.scalar(select(func.count()).select_from(ProductInterest).where(
        ProductInterest.product_id == product_id,
        ProductInterest.country == country,
    )) or 0
    return {"data": {"accepted": True, "interestCount": count, "country": country}}


@router.post("/{product_id}/waitlist", response_model=dict)
async def join_product_waitlist(
    product_id: UUID,
    payload: ProductWaitlistRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    customer: Customer | None = Depends(get_optional_customer),
):
    require_csrf(request)
    await enforce_rate_limit(request, "product-waitlist", 10, 3600)
    product = await product_by_id(product_id, db)
    email = str(payload.email).lower().strip()
    existing = await db.scalar(select(ProductWaitlistEntry).where(
        ProductWaitlistEntry.product_id == product_id,
        ProductWaitlistEntry.email == email,
    ))
    if existing:
        if customer and existing.customer_id is None and customer.email == email:
            existing.customer_id = customer.id
            existing.first_name = payload.firstName.strip() or customer.first_name
            await db.commit()
        return {"data": {"accepted": True}}
    entry = ProductWaitlistEntry(
        product_id=product_id,
        customer_id=customer.id if customer and customer.email == email else None,
        email=email,
        first_name=payload.firstName.strip() or (customer.first_name if customer and customer.email == email else ""),
    )
    db.add(entry)
    db.add(OutboxEvent(event_type="product.waitlist_joined", payload={
        "productId": str(product.id), "productName": product.name, "email": email,
    }))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    return {"data": {"accepted": True}}
