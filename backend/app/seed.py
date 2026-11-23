import asyncio
import re
from datetime import date
from uuid import uuid5, NAMESPACE_URL

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.models import Customer, Product, ProductTranslation, ProductVariant
from app.config import settings
from app.demo_translations import DEMO_FIELD_TRANSLATIONS, DEMO_MAKER_TRANSLATIONS, DEMO_PRODUCT_TRANSLATIONS
from app.security import hash_password
from app.storefront_data import link_demo_catalog
from app.translations import _product_translation_entries, _set_nested, source_hash

RETIRED_LINEUP_DEMO_IMAGE_PATTERN = "%/images/catalog/lineup/%"

PRODUCTS = [
    {"slug": "hoshi-cloud-bear", "name": "Hoshi Cloud Bear", "description": "A warm, squishy cream teddy bear with a classic gingham bow.", "price": 18800, "category": "Bears", "type": "Plush", "tags": ["bear", "new-arrival", "rare"], "size": "Medium", "dimensions": "30 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-bear.jpg", "alt": "Warm cream teddy bear plush with a checkered bow", "stock": 20},
    {"slug": "haneul-bunny", "name": "Haneul Bunny", "description": "A soft, long-eared bunny in cream with a blue bow.", "price": 17800, "category": "Bunnies", "type": "Plush", "tags": ["bunny", "new-arrival", "premium"], "size": "Medium", "dimensions": "35 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-bunny.jpg", "alt": "Cream bunny plush with long ears and a blue bow", "stock": 20},
    {"slug": "mint-dino", "name": "Mint Dino", "description": "A mint-green dinosaur with soft spikes and a friendly, curious face.", "price": 21200, "category": "Characters", "type": "Plush", "tags": ["character", "new-arrival", "rare"], "size": "Small", "dimensions": "28 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-dinosaur.jpg", "alt": "Mint green dinosaur plush with soft spikes", "stock": 20},
    {"slug": "cherry-blossom-bunny", "name": "Cherry Blossom Bunny", "description": "A rosy bunny with a little flower nestled by its ear. A limited springtime friend from Studio Haneul.", "price": 22900, "category": "Bunnies", "type": "Plush", "tags": ["bunny", "rare", "limited-edition"], "size": "Small", "dimensions": "26 cm", "supplier": "Studio Haneul · South Korea", "image": "/images/catalog/maker-pink-bunny.jpg", "alt": "Soft pink bunny plush with a small flower detail", "stock": 8},
    {"slug": "good-things-ahead-kitty", "name": "Good Things Ahead Kitty XL", "description": "An oversized cream kitty with a soft pink bow and a cloud-like, huggable shape.", "price": 22900, "category": "Giant plush", "type": "XL Plush", "tags": ["cat", "new-arrival", "domina-xl"], "size": "XL", "dimensions": "XL", "supplier": "Ponyo", "image": "/images/catalog/ponyo-11.png", "alt": "Oversized cream cat plush with a rose-colored bow", "stock": 0},
    {"slug": "better-days-panda", "name": "Better Days Panda XL", "description": "An oversized cloud-soft panda with a blush bow and a little reminder to stay happy.", "price": 25600, "category": "Giant plush", "type": "XL Plush", "tags": ["panda", "rare", "premium", "domina-xl"], "size": "XL", "dimensions": "XL", "supplier": "Ponyo", "image": "/images/catalog/ponyo-12.png", "alt": "Oversized cream and charcoal panda plush with a blush bow", "stock": 6},
    {"slug": "cloud-cat", "name": "Cloud Cat", "description": "A sleepy cream-and-caramel cat plush, soft as a little cloud and hard to find.", "price": 19600, "category": "Cats", "type": "Plush", "tags": ["cat", "rare", "limited-edition"], "size": "Small", "dimensions": "24 cm", "supplier": "Ponyo selected maker", "image": "/images/catalog/maker-cat.jpg", "alt": "Sleepy cream cat plush with caramel markings", "stock": 7},
    {"slug": "bluebell-penguin", "name": "Bluebell Penguin", "description": "A tiny round penguin in soft blue and snowy white.", "price": 27500, "category": "Penguins", "type": "Plush", "tags": ["new-arrival", "penguin", "premium"], "size": "Small", "dimensions": "25 cm", "supplier": "Ponyo", "image": "/images/catalog/maker-penguin.jpg", "alt": "Round blue and white penguin plush", "stock": 20},
    {"slug": "hoshi-cloud-bear-xl", "name": "Hoshi Cloud Bear XL", "description": "The 90 cm giant version of Hoshi Cloud Bear. An extra-big cuddle buddy from Domina.", "price": 68000, "category": "Giant plush", "type": "XL Plush", "tags": ["bear", "domina-xl"], "size": "XL", "dimensions": "90 cm", "supplier": "Domina", "image": "/images/catalog/hoshi-cloud-bear-xl.png", "alt": "Large brown teddy bear plush with a gingham bow", "stock": 3},
    {"slug": "haneul-bunny-xl", "name": "Haneul Bunny XL", "description": "A giant cream bunny standing 100 cm tall, from Domina.", "price": 74500, "category": "Giant plush", "type": "XL Plush", "tags": ["bunny", "domina-xl"], "size": "XL", "dimensions": "100 cm", "supplier": "Domina", "image": "/images/catalog/haneul-bunny-xl.png", "alt": "Oversized cream bunny plush shown at room scale", "stock": 3},
    {"slug": "baluran-elephant-xl", "name": "Baluran Elephant XL", "description": "An extra-large 120 cm elephant plush from Domina, the centrepiece of any room.", "price": 89000, "category": "Giant plush", "type": "XL Plush", "tags": ["character", "domina-xl"], "size": "XL", "dimensions": "120 cm", "supplier": "Domina", "image": "/images/catalog/ponyo-6.png", "alt": "An oversized elephant plush", "stock": 3},
    {"slug": "daisy-flower-cushion", "name": "Daisy Flower Cushion", "description": "A soft daisy-shaped cushion in warm cream and sunny yellow.", "price": 19800, "category": "Cushions", "type": "Character Cushion", "tags": ["cushion", "character", "demo"], "size": "Medium", "dimensions": "38 cm", "supplier": "Ponyo demo collection", "image": "/images/catalog/daisy-flower-cushion.png", "alt": "Cream daisy-shaped cushion with a sunny yellow centre", "stock": 10},
    {"slug": "mallow-cloud-sofa", "name": "Mallow Cloud Sofa", "description": "A low, cushioned sofa made for cozy reading corners.", "price": 62800, "category": "Soft Furniture", "type": "Seating", "tags": ["seating", "furniture", "demo"], "size": "Medium", "dimensions": "110 cm", "supplier": "Ponyo demo collection", "image": "/images/catalog/mallow-floor-sofa.png", "alt": "A plush-filled cream sofa in a cozy pastel room", "stock": 4},
    {"slug": "moon-jelly-wall-hanging", "name": "Moon Jelly Wall Hanging", "description": "A soft wall hanging featuring a friendly jellyfish design.", "price": 21800, "category": "Wall & Decor", "type": "Wall Hanging", "tags": ["wall-decor", "decor", "demo"], "size": "Medium", "dimensions": "45 cm", "supplier": "Ponyo demo collection", "image": "/images/catalog/moon-jelly-wall-hanging.png", "alt": "Pink wall hanging decorated with a smiling jellyfish", "stock": 8},
    {"slug": "sleepy-miso-cat", "name": "Sleepy Miso Cat", "description": "A relaxed cream kitty with cocoa-brown patches, rounded paws, and embroidered sleepy eyes.", "price": 19800, "category": "Cats", "type": "Plush", "tags": ["cat", "new-arrival", "demo"], "size": "Small", "dimensions": "24 cm", "supplier": "Ponyo", "image": "/images/catalog/sleepy-miso-cat.webp", "alt": "Cream cat plush with cocoa patches and closed eyes", "stock": 14},
    {"slug": "moon-jelly-plush", "name": "Moon Jelly Plush", "description": "A friendly blue-grey jellyfish with a domed, velvety body and soft hanging tentacles.", "price": 16800, "category": "Characters", "type": "Character Plush", "tags": ["character", "new-arrival", "demo"], "size": "Small", "dimensions": "25 cm", "supplier": "Ponyo", "image": "/images/catalog/moon-jelly-plush.webp", "alt": "Blue-grey jellyfish plush with soft ivory tentacles", "stock": 12},
    {"slug": "cocoa-puppy-plush", "name": "Cocoa-Eared Puppy", "description": "A floppy-eared cream puppy with cocoa-brown ears and a gentle embroidered face.", "price": 18800, "category": "Puppies", "type": "Plush", "tags": ["dog", "new-arrival", "demo"], "size": "Small", "dimensions": "27 cm", "supplier": "Ponyo", "image": "/images/catalog/cocoa-puppy-plush.webp", "alt": "Cream puppy plush with floppy cocoa-brown ears", "stock": 13},
    {"slug": "sunbeam-daisy-cushion", "name": "Sunbeam Daisy Cushion", "description": "A plush daisy cushion with rounded cream petals and a warm golden centre.", "price": 19800, "category": "Cushions", "type": "Character Cushion", "tags": ["cushion", "character", "new-arrival", "demo"], "size": "Medium", "dimensions": "38 cm", "supplier": "Ponyo", "image": "/images/catalog/sunbeam-daisy-cushion.webp", "alt": "Cream daisy cushion with a golden yellow centre", "stock": 10},
    {"slug": "toasty-teddy-plush", "name": "Toasty Teddy Bear", "description": "A soft caramel teddy with rounded ears and a small, friendly embroidered expression.", "price": 17800, "category": "Bears", "type": "Plush", "tags": ["bear", "premium", "demo"], "size": "Small", "dimensions": "26 cm", "supplier": "Ponyo", "image": "/images/catalog/toasty-teddy-plush.webp", "alt": "Small caramel teddy bear plush with rounded ears", "stock": 12},
    {"slug": "honey-star-cushion", "name": "Honey Star Cushion", "description": "A golden star-shaped cushion with a simple stitched face and a gently padded feel.", "price": 17800, "category": "Cushions", "type": "Character Cushion", "tags": ["cushion", "character", "demo"], "size": "Medium", "dimensions": "34 cm", "supplier": "Ponyo", "image": "/images/catalog/honey-star-cushion.webp", "alt": "Golden yellow star-shaped cushion with a stitched face", "stock": 9},
    {"slug": "moon-jelly-tapestry", "name": "Moon Jelly Wall Tapestry", "description": "A woven wall hanging with a quiet blue jellyfish motif and a soft fringe finish.", "price": 23800, "category": "Wall & Decor", "type": "Wall Hanging", "tags": ["wall-decor", "decor", "demo"], "size": "Medium", "dimensions": "45 cm", "supplier": "Ponyo", "image": "/images/catalog/moon-jelly-tapestry.webp", "alt": "Blue jellyfish motif woven into a fringed wall tapestry", "stock": 8},
    {"slug": "cloud-hug-cushion", "name": "Cloud Hug Cushion", "description": "A soft white cloud cushion with rosy cheeks and a rounded, easy-to-style silhouette.", "price": 18900, "category": "Cushions", "type": "Character Cushion", "tags": ["cushion", "character", "demo"], "size": "Medium", "dimensions": "38 cm", "supplier": "Ponyo", "image": "/images/catalog/cloud-hug-cushion.webp", "alt": "White cloud-shaped cushion with rosy cheeks", "stock": 10},
    {"slug": "tidepool-octopus-plush", "name": "Tidepool Octopus", "description": "A round ivory octopus plush with soft tentacles and a calm, minimal face.", "price": 21800, "category": "Characters", "type": "Character Plush", "tags": ["character", "new-arrival", "demo"], "size": "Medium", "dimensions": "30 cm", "supplier": "Ponyo", "image": "/images/catalog/tidepool-octopus-plush.webp", "alt": "Ivory octopus plush with a rounded body and soft tentacles", "stock": 10},
    {"slug": "fern-dino-plush", "name": "Fernback Dinosaur", "description": "A mellow sage-green dinosaur plush with soft back spikes and a friendly stitched smile.", "price": 23800, "category": "Characters", "type": "Character Plush", "tags": ["character", "premium", "demo"], "size": "Medium", "dimensions": "30 cm", "supplier": "Ponyo", "image": "/images/catalog/fern-dino-plush.webp", "alt": "Sage-green dinosaur plush with soft back spikes", "stock": 9},
    {"slug": "morning-bunny-plush", "name": "Morning Cloud Bunny", "description": "A gentle cream bunny with long floppy ears and a softly rounded sitting shape.", "price": 22800, "category": "Bunnies", "type": "Plush", "tags": ["bunny", "new-arrival", "demo"], "size": "Medium", "dimensions": "32 cm", "supplier": "Ponyo", "image": "/images/catalog/morning-bunny-plush.webp", "alt": "Cream bunny plush with long floppy ears", "stock": 11},
    {"slug": "strawberry-mushroom-plush", "name": "Strawberry Cap Mushroom", "description": "A little red-capped mushroom plush with a soft ivory stem and playful white spots.", "price": 16800, "category": "Characters", "type": "Character Plush", "tags": ["character", "new-arrival", "demo"], "size": "Small", "dimensions": "26 cm", "supplier": "Ponyo", "image": "/images/catalog/strawberry-mushroom-plush.webp", "alt": "Mushroom plush with a red cap, white spots, and an ivory stem", "stock": 12},
    {"slug": "mallow-reading-chair", "name": "Mallow Reading Chair", "description": "A cushioned accent chair with rounded arms and a matching footstool for a cozy reading nook.", "price": 62800, "category": "Soft Furniture", "type": "Seating", "tags": ["seating", "furniture", "demo"], "size": "Medium", "dimensions": "90 cm wide", "supplier": "Ponyo", "image": "/images/catalog/mallow-reading-chair.webp", "alt": "Cream upholstered accent chair with a matching footstool", "stock": 4},
    {"slug": "peach-petal-cushion", "name": "Peach Petal Cushion", "description": "A soft blossom-shaped cushion in a gentle peach shade for a sofa or reading corner.", "price": 19800, "category": "Cushions", "type": "Character Cushion", "tags": ["cushion", "character", "demo"], "size": "Medium", "dimensions": "38 cm", "supplier": "Ponyo", "image": "/images/catalog/peach-petal-cushion.webp", "alt": "Peach-toned flower-shaped cushion with rounded petals", "stock": 10},
    {"slug": "seashell-floor-cushion", "name": "Seashell Floor Cushion", "description": "A generously padded shell-shaped cushion with stitched ridges and a soft ivory finish.", "price": 22800, "category": "Cushions", "type": "Cushion", "tags": ["cushion", "demo"], "size": "Medium", "dimensions": "45 cm", "supplier": "Ponyo", "image": "/images/catalog/seashell-floor-cushion.webp", "alt": "Ivory seashell-shaped floor cushion with stitched ridges", "stock": 8},
    {"slug": "moon-cloud-throw", "name": "Moon Cloud Throw Blanket", "description": "A lightweight plush throw in a soft cream palette with a subtle moon-and-cloud pattern.", "price": 32800, "category": "Wall & Decor", "type": "Throw Blanket", "tags": ["decor", "textile", "demo"], "size": "Medium", "dimensions": "120 × 160 cm", "supplier": "Ponyo", "image": "/images/catalog/moon-cloud-throw.webp", "alt": "Cream throw blanket with a subtle character pattern", "stock": 8},
    {"slug": "ponyo-naptime-cat", "name": "Ponyo Naptime Cat Plush", "description": "A softly sculpted cat plush with warm peach markings, embroidered paws, and a sleepy expression.", "price": 26800, "category": "Characters", "type": "Character Plush", "tags": ["cat", "character", "new-arrival", "demo"], "size": "Medium", "dimensions": "42 cm", "supplier": "Ponyo", "image": "/images/catalog/ponyo-naptime-cat.webp", "alt": "Large cream cat plush with peach markings and embroidered paws", "stock": 0},
    {"slug": "ponyo-cat-face-cushion", "name": "Ponyo Cat Face Cushion", "description": "A round character cushion with a calm cat expression and a soft, squishy profile.", "price": 22800, "category": "Cushions", "type": "Character Cushion", "tags": ["cushion", "character", "demo"], "size": "Medium", "dimensions": "42 cm", "supplier": "Ponyo", "image": "/images/catalog/ponyo-cat-face-cushion.webp", "alt": "Round cream cat-face cushion with a gentle embroidered expression", "stock": 9},
    {"slug": "moon-jelly-mobile", "name": "Moon Jelly Nursery Mobile", "description": "A lightweight hanging mobile with soft jellyfish and star accents for a calm nursery corner.", "price": 24800, "category": "Wall & Decor", "type": "Wall Hanging", "tags": ["wall-decor", "decor", "demo"], "size": "Medium", "dimensions": "45 cm", "supplier": "Ponyo", "image": "/images/catalog/moon-jelly-mobile.webp", "alt": "Hanging jellyfish mobile with small star accents", "stock": 0},
    {"slug": "pastel-stacking-cushions", "name": "Pastel Stacking Cushion Set", "description": "A coordinated trio of round floor cushions in soft pastel tones with a plush star accent.", "price": 52800, "category": "Cushions", "type": "Character Cushion", "tags": ["cushion", "character", "demo"], "size": "Medium", "dimensions": "Set of 3", "supplier": "Ponyo", "image": "/images/catalog/pastel-stacking-cushions.webp", "alt": "Stacked cream, pink, and blue floor cushions with a star cushion", "stock": 5},
    {"slug": "ponyo-cat-throw", "name": "Ponyo Kitty Throw Blanket", "description": "A cozy cream throw featuring a delicate repeating cat motif for a sofa or bed.", "price": 34800, "category": "Wall & Decor", "type": "Throw Blanket", "tags": ["decor", "textile", "demo"], "size": "Medium", "dimensions": "120 × 160 cm", "supplier": "Ponyo", "image": "/images/catalog/ponyo-cat-throw.webp", "alt": "Cream throw blanket with a repeating cat print", "stock": 7},
    {"slug": "ponyo-cat-rug", "name": "Ponyo Cat-Shaped Rug", "description": "A soft cat-shaped floor rug in warm cream tones with a simple embroidered-style face.", "price": 32800, "category": "Wall & Decor", "type": "Rug", "tags": ["decor", "textile", "demo"], "size": "Medium", "dimensions": "80 × 55 cm", "supplier": "Ponyo", "image": "/images/catalog/ponyo-cat-rug.webp", "alt": "Cream cat-shaped rug with a simple face", "stock": 6},
    {"slug": "ponyo-round-cat-seat", "name": "Ponyo Round Cat Floor Seat", "description": "A low, round floor seat with a plush cat-inspired profile and a soft tufted accent.", "price": 48800, "category": "Soft Furniture", "type": "Seating", "tags": ["seating", "furniture", "demo"], "size": "Medium", "dimensions": "60 cm", "supplier": "Ponyo", "image": "/images/catalog/ponyo-round-cat-seat.webp", "alt": "Round cream floor seat with a plush cat-inspired shape", "stock": 6},
]

PRODUCT_COLORS = {
    "good-things-ahead-kitty": "Cream and pink",
    "hoshi-cloud-bear": "Cream",
    "haneul-bunny": "Cream",
    "mint-dino": "Mint green",
    "cherry-blossom-bunny": "Pink",
    "better-days-panda": "Cream and charcoal",
    "cloud-cat": "Cream and caramel",
    "bluebell-penguin": "Blue and white",
    "hoshi-cloud-bear-xl": "Cream",
    "haneul-bunny-xl": "Cream",
    "baluran-elephant-xl": "Grey",
    "daisy-flower-cushion": "Cream and yellow",
    "mallow-cloud-sofa": "Cream",
    "moon-jelly-wall-hanging": "Pink",
    "sleepy-miso-cat": "Cream and caramel",
    "moon-jelly-plush": "Blue and white",
    "cocoa-puppy-plush": "Cream and caramel",
    "sunbeam-daisy-cushion": "Cream and yellow",
    "toasty-teddy-plush": "Cream and caramel",
    "honey-star-cushion": "Cream and yellow",
    "moon-jelly-tapestry": "Blue and white",
    "cloud-hug-cushion": "Cream",
    "tidepool-octopus-plush": "Cream",
    "fern-dino-plush": "Green",
    "morning-bunny-plush": "Cream",
    "strawberry-mushroom-plush": "Pink",
    "mallow-reading-chair": "Cream",
    "peach-petal-cushion": "Pink",
    "seashell-floor-cushion": "Cream",
    "moon-cloud-throw": "Cream",
    "ponyo-naptime-cat": "Cream and caramel",
    "ponyo-cat-face-cushion": "Cream and caramel",
    "moon-jelly-mobile": "Cream and yellow",
    "pastel-stacking-cushions": "Pink",
    "ponyo-cat-throw": "Cream and caramel",
    "ponyo-cat-rug": "Cream and caramel",
    "ponyo-round-cat-seat": "Cream",
}

PRODUCT_STATUSES = {
    "good-things-ahead-kitty": "Waitlist",
    "hoshi-cloud-bear": "Available",
    "haneul-bunny": "Coming Soon",
    "mint-dino": "Available",
    "cherry-blossom-bunny": "Available",
    "better-days-panda": "Available",
    "cloud-cat": "Available",
    "bluebell-penguin": "Available",
    "hoshi-cloud-bear-xl": "Available",
    "haneul-bunny-xl": "Waitlist",
    "baluran-elephant-xl": "Unavailable",
    "daisy-flower-cushion": "Available",
    "mallow-cloud-sofa": "Available",
    "moon-jelly-wall-hanging": "Available",
    "sleepy-miso-cat": "Available",
    "moon-jelly-plush": "Available",
    "cocoa-puppy-plush": "Available",
    "sunbeam-daisy-cushion": "Available",
    "toasty-teddy-plush": "Available",
    "honey-star-cushion": "Available",
    "moon-jelly-tapestry": "Available",
    "cloud-hug-cushion": "Available",
    "tidepool-octopus-plush": "Available",
    "fern-dino-plush": "Available",
    "morning-bunny-plush": "Available",
    "strawberry-mushroom-plush": "Available",
    "mallow-reading-chair": "Available",
    "peach-petal-cushion": "Available",
    "seashell-floor-cushion": "Available",
    "moon-cloud-throw": "Available",
    "ponyo-naptime-cat": "Waitlist",
    "ponyo-cat-face-cushion": "Available",
    "moon-jelly-mobile": "Coming Soon",
    "pastel-stacking-cushions": "Available",
    "ponyo-cat-throw": "Available",
    "ponyo-cat-rug": "Available",
    "ponyo-round-cat-seat": "Available",
}


def _reviewed_demo_fields(product: Product, locale: str) -> dict:
    reviewed = DEMO_PRODUCT_TRANSLATIONS[locale][product.slug]
    fields = DEMO_FIELD_TRANSLATIONS[locale]
    translated_fields = {}
    for path, source in _product_translation_entries(product):
        field = path[0]
        if field == "categoryName":
            translated = fields["categories"][source]
        elif field == "productType":
            translated = fields["types"][source]
        elif field == "sizeTier":
            translated = fields["sizes"][source]
        elif field == "dimensions":
            translated = source
        elif field == "dispatchTime":
            translated = fields["dispatch_time"]
        elif field == "materials":
            translated = fields["materials"]
        elif field.startswith("maker"):
            if product.brand is None:
                raise ValueError(f"Missing demo maker for {product.slug}.")
            maker = DEMO_MAKER_TRANSLATIONS[locale][product.brand.slug]
            maker_field = {
                "makerStory": "story",
                "makerPhilosophy": "philosophy",
                "makerProcess": "process",
                "makerLocation": "location",
                "makerSpecialties": "specialties",
            }[field]
            translated = maker[maker_field][int(path[-1])] if field == "makerSpecialties" else maker[maker_field]
        elif field in {"imageAlt", "imageAlts"}:
            translated = reviewed["image_alt"]
        elif field == "variants":
            if path[-1] == "title":
                translated = fields["variant_title"]
            elif path[-1] == "key":
                translated = fields["option_keys"][source]
            elif source in fields["colors"]:
                translated = fields["colors"][source]
            else:
                translated = fields["sizes"][source]
        else:
            raise ValueError(f"Missing reviewed demo translation for {product.slug}: {'.'.join(path)}")
        _set_nested(translated_fields, path, translated)
    return translated_fields


async def _seed_demo_translations(db) -> None:
    slugs = set(DEMO_PRODUCT_TRANSLATIONS["ja"])
    products = (await db.scalars(
        select(Product).where(Product.slug.in_(slugs)).options(
            selectinload(Product.variants), selectinload(Product.category),
            selectinload(Product.brand), selectinload(Product.images),
        )
    )).all()
    if {product.slug for product in products} != slugs:
        raise RuntimeError("The reviewed translation catalog does not match the seeded demo products.")
    for product in products:
        digest = source_hash(product)
        for locale in ("ja", "ko"):
            copy = DEMO_PRODUCT_TRANSLATIONS[locale][product.slug]
            translation = await db.scalar(select(ProductTranslation).where(
                ProductTranslation.product_id == product.id,
                ProductTranslation.locale == locale,
            ))
            if translation is None:
                translation = ProductTranslation(
                    product_id=product.id, locale=locale, source_hash=digest,
                    name=copy["name"], description=copy["description"],
                    fields=_reviewed_demo_fields(product, locale), provider="ponyo-reviewed",
                )
                db.add(translation)
            else:
                translation.source_hash = digest
                translation.name = copy["name"]
                translation.description = copy["description"]
                translation.fields = _reviewed_demo_fields(product, locale)
                translation.provider = "ponyo-reviewed"


def stable_id(value: str):
    return uuid5(NAMESPACE_URL, f"https://ponyo.example/products/{value}")


async def seed_initial_admin() -> bool:
    email = str(settings.initial_admin_email).strip().lower()
    async with SessionLocal() as db:
        existing = await db.scalar(select(Customer).where(func.lower(Customer.email) == email))
        if existing is not None:
            if existing.role != "admin":
                raise RuntimeError("INITIAL_ADMIN_EMAIL is already assigned to a non-admin account.")
            return False

        password = settings.initial_admin_password.get_secret_value()
        if not password:
            raise RuntimeError("Set INITIAL_ADMIN_PASSWORD before starting with a new database.")
        first_name = settings.initial_admin_first_name.strip()
        if not 1 <= len(first_name) <= 120:
            raise RuntimeError("INITIAL_ADMIN_FIRST_NAME must contain 1 to 120 characters.")
        if (
            not 8 <= len(password) <= 128
            or not any(character.isdigit() for character in password)
            or not any(not character.isalnum() for character in password)
        ):
            raise RuntimeError("INITIAL_ADMIN_PASSWORD must be 8 to 128 characters and include a number and a special character.")

        db.add(Customer(
            email=email,
            first_name=first_name,
            password_hash=hash_password(password),
            email_verified=True,
            role="admin",
        ))
        try:
            await db.commit()
        except IntegrityError as error:
            await db.rollback()
            existing = await db.scalar(select(Customer).where(func.lower(Customer.email) == email))
            if existing is not None and existing.role == "admin":
                return False
            raise RuntimeError("Could not safely create the initial admin account.") from error
        return True


async def seed_products() -> None:
    if settings.environment == "production":
        raise RuntimeError("Demo catalog and supplier seeds must not run in production.")
    async with SessionLocal() as db:
        lineup_products = (await db.scalars(select(Product).where(
            Product.is_demo.is_(True),
            Product.image_url.like(RETIRED_LINEUP_DEMO_IMAGE_PATTERN),
        ))).all()
        for product in lineup_products:
            product.published = False
        for item in PRODUCTS:
            product_id = stable_id(item["slug"])
            status = PRODUCT_STATUSES[item["slug"]]
            stock_quantity = item["stock"] if status == "Available" else 0
            product = await db.scalar(select(Product).where(Product.slug == item["slug"]))
            if product is None:
                product = Product(
                    id=product_id,
                    sku=f"PNY-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}",
                    slug=item["slug"],
                    name=item["name"],
                    description=item["description"],
                    currency="JPY",
                    price_amount=item["price"],
                    availability="available" if status == "Available" else "unavailable",
                    availability_status=status,
                    category_name=item["category"],
                    product_type=item["type"],
                    supplier_name=item["supplier"],
                    image_url=item["image"],
                    image_alt=item["alt"],
                    tags=item["tags"],
                    size_tier=item["size"],
                    dimensions=item["dimensions"],
                    materials="Polyester plush; polyester fiber fill; embroidered details.",
                    weight_grams={"Small": 240, "Medium": 420, "XL": 4800}[item["size"]],
                    edition_count=240,
                    estimated_delivery_date=date(2027, 1, 15),
                    only_at_ponyo=True,
                    reservations_open=True,
                    reservation_target=50,
                    dispatch_time="Ships in 1–3 business days",
                    is_demo=True,
                    published=True,
                )
                db.add(product)
                await db.flush()
            else:
                product.sku = f"PNY-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}"
                product.name = item["name"]
                product.description = item["description"]
                product.currency = "JPY"
                product.price_amount = item["price"]
                product.availability = "available" if status == "Available" else "unavailable"
                product.availability_status = status
                product.category_name = item["category"]
                product.product_type = item["type"]
                product.supplier_name = item["supplier"]
                product.image_url = item["image"]
                product.image_alt = item["alt"]
                product.tags = item["tags"]
                product.size_tier = item["size"]
                product.dimensions = item["dimensions"]
                product.materials = "Polyester plush; polyester fiber fill; embroidered details."
                product.weight_grams = {"Small": 240, "Medium": 420, "XL": 4800}[item["size"]]
                product.edition_count = 240
                product.estimated_delivery_date = date(2027, 1, 15)
                product.only_at_ponyo = True
                product.dispatch_time = "Ships in 1–3 business days"
                product.is_demo = True
                product.published = True
            variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product.id, ProductVariant.title == "Default"))
            if variant is None:
                db.add(ProductVariant(
                    id=stable_id(f"{item['slug']}-default"),
                    product_id=product.id,
                    title="Default",
                    sku=f"PNV-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}-DEFAULT",
                    options={"Size": item["size"], "Color": PRODUCT_COLORS[item["slug"]]},
                    currency="JPY",
                    price_amount=item["price"],
                    stock_quantity=stock_quantity,
                    active=True,
                ))
            else:
                variant.sku = f"PNV-{re.sub(r'[^A-Z0-9]+', '-', item['slug'].upper()).strip('-')}-DEFAULT"
                variant.options = {"Size": item["size"], "Color": PRODUCT_COLORS[item["slug"]]}
                variant.options = {"Size": item["size"], "Color": PRODUCT_COLORS[item["slug"]]}
                variant.currency = "JPY"
                variant.price_amount = item["price"]
                # Re-running the fixture must not replenish previously reserved/sold stock.
                variant.active = True
        await db.flush()
        await link_demo_catalog(db)
        await _seed_demo_translations(db)
        await db.commit()


async def seed_startup_data() -> None:
    await seed_initial_admin()
    if settings.environment != "production":
        await seed_products()


if __name__ == "__main__":
    asyncio.run(seed_startup_data())
