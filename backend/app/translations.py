from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Iterable
from typing import Any
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AppTranslation, Product, ProductTranslation


TRANSLATION_LOCALES = {"ja": "ja", "ko": "ko"}


class TranslationUnavailableError(RuntimeError):
    pass


def _product_translation_entries(product: Product) -> list[tuple[tuple[str, ...], str]]:
    entries: list[tuple[tuple[str, ...], str]] = []

    def add(path: tuple[str, ...], value: Any) -> None:
        if isinstance(value, str) and value:
            entries.append((path, value))

    add(("categoryName",), product.category.name if product.category else product.category_name)
    add(("productType",), product.product_type)
    add(("materials",), product.materials)
    add(("dimensions",), product.dimensions)
    add(("dispatchTime",), product.dispatch_time)
    add(("sizeTier",), product.size_tier)
    add(("imageAlt",), product.image_alt)
    for image in sorted(product.images, key=lambda item: (item.sort_order, str(item.id))):
        add(("imageAlts", str(image.id)), image.alt)
    for variant in sorted((item for item in product.variants if item.active), key=lambda item: str(item.id)):
        add(("variants", str(variant.id), "title"), variant.title)
        for index, (key, value) in enumerate(sorted((variant.options or {}).items())):
            add(("variants", str(variant.id), "options", str(index), "key"), key)
            add(("variants", str(variant.id), "options", str(index), "value"), value)
    if product.brand and not product.brand.is_demo:
        add(("makerStory",), product.brand.maker_story)
        add(("makerPhilosophy",), product.brand.philosophy)
        add(("makerProcess",), product.brand.process)
        add(("makerLocation",), product.brand.location)
        for index, specialty in enumerate(product.brand.specialties or []):
            add(("makerSpecialties", str(index)), specialty)
    return entries


def _set_nested(target: dict[str, Any], path: Iterable[str], value: str) -> None:
    parts = list(path)
    current = target
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def _get_nested(source: dict[str, Any], path: Iterable[str], default: Any = None) -> Any:
    current: Any = source
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    return current


def source_hash(product: Product) -> str:
    source = json.dumps(
        {
            "name": product.name,
            "description": product.description,
            "fields": [(list(path), value) for path, value in _product_translation_entries(product)],
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def copy_source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _translate_with_libretranslate(text: str, target_language: str) -> str:
    payload: dict[str, str] = {
        "q": text,
        "source": "auto",
        "target": target_language,
        "format": "text",
    }
    if settings.libretranslate_api_key:
        payload["api_key"] = settings.libretranslate_api_key
    request = Request(
        f"{settings.libretranslate_url.rstrip('/')}/translate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=settings.translation_timeout_seconds) as response:
        result = json.loads(response.read().decode("utf-8"))
    translated = result.get("translatedText") if isinstance(result, dict) else None
    if not isinstance(translated, str) or not translated.strip():
        raise TranslationUnavailableError("LibreTranslate returned an empty translation.")
    return translated.strip()


async def _translate_product(
    product: Product,
    target_language: str,
) -> tuple[str, str, dict[str, Any]]:
    if settings.translation_provider != "libretranslate":
        raise TranslationUnavailableError("LibreTranslate is not enabled.")
    try:
        entries = _product_translation_entries(product)
        source_texts = list(dict.fromkeys(
            text for text in (product.name, product.description, *(value for _, value in entries)) if text
        ))
        semaphore = asyncio.Semaphore(6)

        async def translate_one(text: str) -> tuple[str, str]:
            async with semaphore:
                translated = await asyncio.wait_for(
                    asyncio.to_thread(_translate_with_libretranslate, text, target_language),
                    timeout=settings.translation_timeout_seconds,
                )
                return text, translated

        translated_by_source = dict(await asyncio.gather(*(translate_one(text) for text in source_texts)))
        fields: dict[str, Any] = {}
        for path, text in entries:
            _set_nested(fields, path, translated_by_source[text])
        return (
            translated_by_source.get(product.name, product.name),
            translated_by_source.get(product.description, product.description),
            fields,
        )
    except Exception as error:
        raise TranslationUnavailableError("LibreTranslate could not translate the product.") from error


async def get_product_translation(
    product: Product,
    locale: str,
    db: AsyncSession,
) -> ProductTranslation | None:
    target_language = TRANSLATION_LOCALES.get(locale)
    if not target_language:
        raise TranslationUnavailableError(f"Unsupported product translation locale: {locale}")

    current_hash = source_hash(product)
    cached = await db.scalar(select(ProductTranslation).where(
        ProductTranslation.product_id == product.id,
        ProductTranslation.locale == locale,
    ))
    if cached and cached.source_hash == current_hash:
        return cached

    translated = await _translate_product(product, target_language)

    if cached is None:
        cached = ProductTranslation(product_id=product.id, locale=locale, source_hash=current_hash, provider="libretranslate")
        db.add(cached)
    cached.name, cached.description, cached.fields = translated
    cached.source_hash = current_hash
    cached.provider = "libretranslate"
    return cached


async def ensure_product_translations(product: Product, db: AsyncSession) -> None:
    for locale in ("ja", "ko"):
        await get_product_translation(product, locale, db)


async def get_app_translations(
    entries: list[tuple[str, str]],
    locale: str,
    db: AsyncSession,
) -> dict[str, str]:
    target_language = TRANSLATION_LOCALES.get(locale)
    if not target_language or settings.translation_provider != "libretranslate":
        return {}

    unique_entries = dict(entries)
    keys = list(unique_entries)
    cached_rows = await db.scalars(select(AppTranslation).where(
        AppTranslation.locale == locale,
        AppTranslation.translation_key.in_(keys),
    ))
    cached_by_key = {row.translation_key: row for row in cached_rows}
    translations: dict[str, str] = {}
    pending: list[tuple[str, str, str]] = []
    for key, text in unique_entries.items():
        source_hash = copy_source_hash(text)
        row = cached_by_key.get(key)
        if row and row.source_hash == source_hash:
            translations[key] = row.translated_text
        else:
            pending.append((key, text, source_hash))

    if not pending:
        return translations

    semaphore = asyncio.Semaphore(6)

    async def translate_one(key: str, text: str, digest: str) -> tuple[str, str, str] | None:
        async with semaphore:
            try:
                result = await asyncio.wait_for(
                    asyncio.to_thread(_translate_with_libretranslate, text, target_language),
                    timeout=settings.translation_timeout_seconds,
                )
                return key, digest, result
            except Exception:
                return None

    results = await asyncio.gather(*(translate_one(*entry) for entry in pending))
    for result in results:
        if result is None:
            continue
        key, digest, translated_text = result
        translations[key] = translated_text
        row = cached_by_key.get(key)
        if row is None:
            row = AppTranslation(
                locale=locale,
                translation_key=key,
                source_hash=digest,
                translated_text=translated_text,
                provider="libretranslate",
            )
            db.add(row)
            cached_by_key[key] = row
        else:
            row.source_hash = digest
            row.translated_text = translated_text
            row.provider = "libretranslate"
    return translations