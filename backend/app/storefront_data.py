"""Development-only linked catalog fixtures; no real supplier partnerships implied."""

import re
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import (
    Brand, Order, OrderStatusHistory, Product, ProductCategory, ProductImage,
    Supplier, SupplierInventory, SupplierOffer,
)
from app.product_categories import PRODUCT_CATEGORY_DEFINITIONS, product_category_slug

DEMO_MAKER_PROFILES = {
    "ponyo": {
        "name": "Kumo Stitch Atelier",
        "maker_story": "A sample maker profile from Kyoto, creating soft animal characters with rounded silhouettes and careful embroidered details.",
        "philosophy": "Thoughtful details can make everyday comfort feel special.",
        "process": "Each sample begins with a hand-drawn shape, then is stitched and checked for softness, seams, and balance.",
        "location": "Kyoto, Japan",
        "specialties": ["Soft animal plush", "Embroidered details"],
    },
    "studio-haneul-south-korea": {
        "name": "Studio Haneul",
        "maker_story": "A sample Seoul studio imagining gentle characters inspired by flowers, clouds, and quiet moments.",
        "philosophy": "A small, kind detail can brighten an ordinary day.",
        "process": "Each sample is shaped, sewn, and reviewed for a soft finish and a friendly expression.",
        "location": "Seoul, South Korea",
        "specialties": ["Character plush", "Soft accessories"],
    },
    "ponyo-selected-maker": {
        "name": "Mori & Mallow Studio",
        "maker_story": "A fictional sample studio making cozy companions with expressive faces and comforting textures.",
        "philosophy": "A plush should feel welcoming from the very first hug.",
        "process": "The studio tests fabric feel, shape, and stitching on each sample before presenting a design.",
        "location": "Osaka, Japan",
        "specialties": ["Cozy companions", "Character design"],
    },
    "domina": {
        "name": "Domina Plush Studio",
        "maker_story": "A sample studio exploring oversized plush companions designed to bring warmth and character into a room.",
        "philosophy": "Big comfort can make a space feel a little more personal.",
        "process": "Each sample is checked for its proportions, seams, and support at a larger scale.",
        "location": "Tokyo, Japan",
        "specialties": ["Oversized plush", "Room-scale characters"],
    },
    "ponyo-demo-collection": {
        "name": "Ponyo Sample Studio",
        "maker_story": "A fictional studio profile created for Ponyo's demo catalog; these maker details are illustrative sample content.",
        "philosophy": "Playful shapes and gentle colors make a plush feel like a friend.",
        "process": "These sample designs are reviewed for shape, color, and clear product details.",
        "location": "Ponyo demo catalog",
        "specialties": ["Sample characters", "Demo catalog"],
    },
}


def demo_id(kind: str, key: str):
    return uuid5(NAMESPACE_URL, f"https://ponyo.example/demo/{kind}/{key}")


def catalog_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:140] or f"catalog-{demo_id('name', name).hex[:16]}"


async def ensure_product_category_taxonomy(db: AsyncSession) -> dict[str, ProductCategory]:
    categories: dict[str, ProductCategory] = {}
    for definition in PRODUCT_CATEGORY_DEFINITIONS:
        category = await db.scalar(select(ProductCategory).where(ProductCategory.slug == definition.slug))
        if category is None:
            category = ProductCategory(id=uuid4(), slug=definition.slug, name=definition.name)
            db.add(category)
        category.name = definition.name
        category.parent_id = categories[definition.parent_slug].id if definition.parent_slug else None
        category.active = True
        categories[definition.slug] = category
        await db.flush()
    return categories


async def link_demo_catalog(db: AsyncSession) -> None:
    """Backfill missing links only. Never replenish stock or overwrite supplier edits."""
    if settings.environment == "production":
        raise RuntimeError("Demo supplier data must not be created in production.")
    categories = await ensure_product_category_taxonomy(db)
    products = (await db.scalars(select(Product).options(selectinload(Product.variants)))).all()
    for product in products:
        if product.category_id is None:
            slug = product_category_slug(
                name=product.name,
                category_name=product.category_name,
                product_type=product.product_type,
                tags=product.tags,
                size_tier=product.size_tier,
            )
            category = categories[slug]
            product.category_id = category.id
            product.category_name = category.name
        brand = await db.get(Brand, product.brand_id) if product.brand_id else None
        if brand is None:
            slug = catalog_slug(product.supplier_name)
            brand = await db.scalar(select(Brand).where(Brand.slug == slug))
            if brand is None:
                brand = Brand(id=demo_id("brand", slug), slug=slug, name=product.supplier_name, is_demo=True)
                db.add(brand)
                await db.flush()
            product.brand_id = brand.id
        profile = DEMO_MAKER_PROFILES.get(brand.slug)
        if brand.is_demo and profile:
            for field, value in profile.items():
                setattr(brand, field, value)
        primary_image = await db.scalar(select(ProductImage).where(
            ProductImage.product_id == product.id,
            ProductImage.sort_order == 0,
        ))
        if primary_image is None:
            db.add(ProductImage(id=demo_id("image", str(product.id)), product_id=product.id, url=product.image_url, alt=product.image_alt, sort_order=0))
        elif brand.is_demo:
            primary_image.url = product.image_url
            primary_image.alt = product.image_alt
        # A manufacturer/brand is not a supplier business. Use explicitly fictional wholesalers.
        code = "DEMO-XL" if "domina" in product.supplier_name.lower() else "DEMO-PLUSH"
        supplier = await db.scalar(select(Supplier).where(Supplier.code == code))
        if supplier is None:
            supplier = Supplier(
                id=demo_id("supplier", code), code=code,
                name="Demo Giant Plush Wholesale" if code == "DEMO-XL" else "Demo Cuddle Supply",
                contact_email=f"{code.lower()}@suppliers.example", is_demo=True,
            )
            db.add(supplier)
            await db.flush()
        for variant in product.variants:
            # Do not invent another offer for a variant already supplied by someone.
            offer = await db.scalar(select(SupplierOffer).where(SupplierOffer.variant_id == variant.id).order_by(SupplierOffer.id))
            if offer is None:
                offer = SupplierOffer(
                    id=demo_id("offer", str(variant.id)), supplier_id=supplier.id,
                    variant_id=variant.id, supplier_sku=f"DEMO-{variant.id.hex[:24].upper()}",
                    cost_amount=max(0, variant.price_amount * 60 // 100), currency=variant.currency,
                    is_primary=True,
                )
                db.add(offer)
                await db.flush()
            elif not offer.is_primary:
                offer_count = await db.scalar(select(func.count()).select_from(SupplierOffer).where(
                    SupplierOffer.variant_id == variant.id,
                )) or 0
                if offer_count == 1:
                    offer.is_primary = True
            if not await db.scalar(select(SupplierInventory.id).where(SupplierInventory.offer_id == offer.id)):
                db.add(SupplierInventory(
                    id=demo_id("inventory", str(offer.id)), offer_id=offer.id,
                    on_hand=max(0, variant.stock_quantity), reserved=0,
                ))
    for order in (await db.scalars(select(Order))).all():
        if not await db.scalar(select(OrderStatusHistory.id).where(OrderStatusHistory.order_id == order.id)):
            db.add(OrderStatusHistory(
                id=demo_id("order-history", str(order.id)), order_id=order.id,
                to_status=order.status, payment_status=order.payment_status,
                fulfillment_status=order.fulfillment_status, source="legacy_snapshot",
                event_key="legacy_snapshot", created_at=order.updated_at,
            ))
    await db.flush()