import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ProductCategoryDefinition:
    slug: str
    name: str
    parent_slug: str | None = None


PRODUCT_CATEGORY_DEFINITIONS = (
    ProductCategoryDefinition("plush-toys", "Plush Toys"),
    ProductCategoryDefinition("collectible-plush", "Collectible Plush", "plush-toys"),
    ProductCategoryDefinition("character-plush", "Character Plush", "plush-toys"),
    ProductCategoryDefinition("oversized", "Oversized"),
    ProductCategoryDefinition("giant-plush", "Giant Plush", "oversized"),
    ProductCategoryDefinition("oversized-soft-objects", "Oversized Soft Objects", "oversized"),
    ProductCategoryDefinition("cushions", "Cushions"),
    ProductCategoryDefinition("designer-cushions", "Designer Cushions", "cushions"),
    ProductCategoryDefinition("character-pillows", "Character Pillows", "cushions"),
    ProductCategoryDefinition("soft-furniture", "Soft Furniture"),
    ProductCategoryDefinition("chairs", "Chairs", "soft-furniture"),
    ProductCategoryDefinition("beds", "Beds", "soft-furniture"),
    ProductCategoryDefinition("seating", "Seating", "soft-furniture"),
    ProductCategoryDefinition("wall-decor", "Wall & Decor"),
)

PRODUCT_CATEGORY_SLUGS = frozenset(category.slug for category in PRODUCT_CATEGORY_DEFINITIONS)


def _normalized_tags(tags: Any) -> set[str]:
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except json.JSONDecodeError:
            tags = [tags]
    return {str(tag).strip().lower() for tag in tags or []}


def product_category_slug(
    *,
    name: str,
    category_name: str,
    product_type: str | None,
    tags: Any,
    size_tier: str | None,
) -> str:
    text = " ".join((name, category_name, product_type or "", size_tier or "")).lower()
    tag_set = _normalized_tags(tags)
    if "wall" in text or "decor" in text:
        return "wall-decor"
    if "cushion" in text or "pillow" in text:
        return "character-pillows" if "character" in text or "character" in tag_set else "designer-cushions"
    if "chair" in text:
        return "chairs"
    if "bed" in text:
        return "beds"
    if "seating" in text or "furniture" in text:
        return "seating"
    if "oversized soft" in text or "soft object" in text:
        return "oversized-soft-objects"
    if (
        (size_tier or "").lower() == "xl"
        or "domina-xl" in tag_set
        or re.search(r"\b(?:xl|giant|oversized)\b", text)
    ):
        return "giant-plush"
    if "character" in text or "character" in tag_set or "mascot" in text:
        return "character-plush"
    return "collectible-plush"
