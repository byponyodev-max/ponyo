"""Development seed catalog keeps categories populated and sample photos distinct."""

from app.seed import PRODUCT_COLORS, PRODUCTS, PRODUCT_STATUSES
from app.product_categories import PRODUCT_CATEGORY_DEFINITIONS, product_category_slug
from pathlib import Path

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app import seed
from app.models import Base, Customer, Product, ProductImage, ProductTranslation, ProductVariant, SupplierInventory, SupplierOffer
from app.security import verify_password
from app.translations import get_product_translation, source_hash


def test_catalog_has_twenty_three_unique_products_and_ten_lineup_images():
    assert len(PRODUCTS) == 23
    slugs = {product["slug"] for product in PRODUCTS}
    assert len(slugs) == 23
    assert set(PRODUCT_COLORS) == slugs
    assert set(PRODUCT_STATUSES) == slugs
    lineup = [product for product in PRODUCTS if "/catalog/lineup/" in product["image"]]
    assert len(lineup) == 10
    assert len({product["image"] for product in lineup}) == 10
    public = Path(__file__).resolve().parents[2] / "public"
    for product in lineup:
        assert "demo" in product["tags"]
        assert product["alt"]
        assert (public / product["image"].lstrip("/")).is_file()
        assert PRODUCT_STATUSES[product["slug"]] == "Available"
    assert len({product["image"] for product in PRODUCTS}) == len(PRODUCTS)
    assert all((public / product["image"].lstrip("/")).is_file() for product in PRODUCTS)


def test_demo_products_cover_all_root_categories():
    definitions = {category.slug: category for category in PRODUCT_CATEGORY_DEFINITIONS}
    roots = set()
    for product in PRODUCTS:
        category_slug = product_category_slug(
            name=product["name"],
            category_name=product["category"],
            product_type=product["type"],
            tags=product["tags"],
            size_tier=product["size"],
        )
        category = definitions[category_slug]
        roots.add(category.parent_slug or category.slug)
    assert roots == {"plush-toys", "oversized", "cushions", "soft-furniture", "wall-decor"}


@pytest.mark.asyncio
async def test_seed_initial_admin_is_verified_and_does_not_reset_existing_password(monkeypatch, tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'admin-seed.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(seed, "SessionLocal", sessions)
    monkeypatch.setattr(seed.settings, "initial_admin_email", "hello@byponyo.com")
    monkeypatch.setattr(seed.settings, "initial_admin_password", SecretStr("InitialPass123!"))
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

        assert await seed.seed_initial_admin() is True
        async with sessions() as db:
            account = await db.scalar(select(Customer).where(Customer.email == "hello@byponyo.com"))
            assert account.role == "admin"
            assert account.email_verified is True
            assert verify_password("InitialPass123!", account.password_hash)
            original_hash = account.password_hash

        monkeypatch.setattr(seed.settings, "initial_admin_password", SecretStr("DifferentPass456!"))
        assert await seed.seed_initial_admin() is False
        async with sessions() as db:
            account = await db.scalar(select(Customer).where(Customer.email == "hello@byponyo.com"))
            assert account.password_hash == original_hash
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_seed_products_is_idempotent_without_replenishing_stock(monkeypatch, tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'seed.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(seed, "SessionLocal", sessions)
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        await seed.seed_products()
        async with sessions() as db:
            product = await db.scalar(select(Product).where(Product.slug == "mochi-cloud"))
            assert product.reservations_open is True
            assert product.reservation_target == 50
            variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id))
            offer = await db.scalar(select(SupplierOffer).where(SupplierOffer.variant_id == variant.id))
            inventory = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == offer.id))
            variant.stock_quantity = 5
            inventory.on_hand = 5
            bad_translation = await db.scalar(select(ProductTranslation).where(
                ProductTranslation.product_id == product.id,
                ProductTranslation.locale == "ja",
            ))
            bad_translation.name = "Bad cached output"
            bad_translation.provider = "libretranslate"
            product.reservations_open = False
            product.reservation_target = 40
            xl_product = await db.scalar(select(Product).where(Product.slug == "hoshi-cloud-bear-xl"))
            xl_image = await db.scalar(select(ProductImage).where(
                ProductImage.product_id == xl_product.id,
                ProductImage.sort_order == 0,
            ))
            xl_image.url = "/images/catalog/maker-bear.jpg"
            await db.commit()
        await seed.seed_products()
        async with sessions() as db:
            for model in (Product, ProductVariant, ProductImage, SupplierOffer, SupplierInventory):
                assert await db.scalar(select(func.count()).select_from(model)) == 23
            assert await db.scalar(select(func.count()).select_from(ProductTranslation)) == 46
            product = await db.scalar(select(Product).where(Product.slug == "mochi-cloud").options(
                selectinload(Product.variants), selectinload(Product.category),
                selectinload(Product.brand), selectinload(Product.images),
            ))
            assert product.reservations_open is False
            assert product.reservation_target == 40
            assert product.materials == "Polyester plush; polyester fiber fill; embroidered details."
            xl_product = await db.scalar(select(Product).where(Product.slug == "hoshi-cloud-bear-xl"))
            xl_image = await db.scalar(select(ProductImage).where(
                ProductImage.product_id == xl_product.id,
                ProductImage.sort_order == 0,
            ))
            assert xl_image.url == xl_product.image_url == "/images/catalog/hoshi-cloud-bear-xl.png"
            assert product.weight_grams == 240
            assert product.edition_count == 240
            assert product.estimated_delivery_date.isoformat() == "2027-01-15"
            assert product.only_at_ponyo is True
            assert product.brand.is_demo is True
            assert product.brand.maker_story.startswith("A fictional studio profile")
            variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id))
            assert variant.stock_quantity == 5
            offer = await db.scalar(select(SupplierOffer).where(SupplierOffer.variant_id == variant.id))
            inventory = await db.scalar(select(SupplierInventory).where(SupplierInventory.offer_id == offer.id))
            assert inventory.on_hand == 5
            monkeypatch.setattr(
                "app.translations._translate_with_libretranslate",
                lambda *_args: pytest.fail("Demo product cache must not call LibreTranslate."),
            )
            for locale, expected_name, expected_category, expected_variant_title in (
                ("ja", "もち雲", "キャラクターぬいぐるみ", "通常版"),
                ("ko", "모찌 구름", "캐릭터 인형", "기본형"),
            ):
                translation = await get_product_translation(product, locale, db)
                assert translation.name == expected_name
                assert translation.source_hash == source_hash(product)
                assert translation.provider == "ponyo-reviewed"
                assert translation.fields["categoryName"] == expected_category
                assert translation.fields["materials"]
                assert translation.fields["makerStory"]
                assert translation.fields["variants"][str(variant.id)]["title"] == expected_variant_title
    finally:
        await engine.dispose()


def test_development_catalog_has_five_distinct_rare_finds():
    rare = [product for product in PRODUCTS if "rare" in product["tags"]]
    assert len(rare) == 5
    assert len({product["slug"] for product in rare}) == 5
    assert {product["slug"] for product in rare} == {
        "hoshi-cloud-bear", "mint-dino", "cherry-blossom-bunny",
        "better-days-panda", "cloud-cat",
    }
    assert all(product["slug"] in PRODUCT_COLORS for product in rare)
    assert all(PRODUCT_STATUSES[product["slug"]] == "Available" for product in rare)
