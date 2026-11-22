"""Public maker profiles and maker applications."""

import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.db import get_db
from app.email_notifications import send_partner_application_notification
from app.maker_application_storage import (
    MAX_SOURCE_PHOTO_BYTES,
    MakerPhotoStorageError,
    delete_maker_application_photos,
    normalize_maker_photo,
    upload_maker_application_photos,
)
from app.models import Brand, MakerApplication, Product
from app.rate_limit import enforce_rate_limit
from app.routers.products import product_response
from app.schemas import MakerApplicationCreate, MakerApplicationFields
from app.security import require_csrf
from app.translations import TRANSLATION_LOCALES, TranslationUnavailableError, _get_nested, get_product_translation

router = APIRouter(prefix="/makers", tags=["makers"])
logger = logging.getLogger(__name__)
MAX_APPLICATION_REQUEST_BYTES = 16 * 1024 * 1024


@router.get("/{slug}", response_model=dict)
async def get_maker_profile(
    slug: str,
    locale: str = Query(default="en", min_length=2, max_length=12),
    db: AsyncSession = Depends(get_db),
):
    if locale not in {"en", *TRANSLATION_LOCALES}:
        raise HTTPException(422, "Unsupported maker locale.")
    maker = await db.scalar(select(Brand).where(Brand.slug == slug, Brand.maker_story.is_not(None)))
    if maker is None:
        raise HTTPException(status_code=404, detail="Maker not found.")
    products = (await db.scalars(
        select(Product)
        .where(Product.brand_id == maker.id, Product.published.is_(True))
        .order_by(Product.name, Product.id)
        .options(
            selectinload(Product.variants),
            selectinload(Product.category),
            selectinload(Product.brand),
            selectinload(Product.images),
        )
    )).all()
    translations = {}
    if locale != "en":
        if not products:
            raise HTTPException(503, "Maker translation is unavailable.")
        try:
            for product in products:
                translations[product.id] = await get_product_translation(product, locale, db)
        except TranslationUnavailableError as error:
            raise HTTPException(503, "Maker translation is unavailable.") from error
        await db.commit()
    profile_translation = translations.get(products[0].id) if products else None
    translated_fields = profile_translation.fields if profile_translation else {}

    def localized_maker(path: tuple[str, ...], source: str | None) -> str | None:
        if locale == "en":
            return source
        value = _get_nested(translated_fields, path)
        return value if isinstance(value, str) and value else None

    specialties = maker.specialties or []
    return {"data": {
        "maker": {
            "id": str(maker.id),
            "slug": maker.slug,
            "name": maker.name,
            "profileImageUrl": maker.profile_image_url,
            "story": localized_maker(("makerStory",), maker.maker_story),
            "philosophy": localized_maker(("makerPhilosophy",), maker.philosophy),
            "process": localized_maker(("makerProcess",), maker.process),
            "location": localized_maker(("makerLocation",), maker.location),
            "specialties": [
                localized_maker(("makerSpecialties", str(index)), value)
                for index, value in enumerate(specialties)
            ],
            "website": maker.website,
            "socialMedia": maker.social_media,
        },
        "products": [
            product_response(product, translations.get(product.id)).model_dump(mode="json")
            for product in products
        ],
    }}


@router.post("/applications", response_model=dict)
async def create_maker_application(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "maker-application", 5, 3600)
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            request_bytes = int(content_length)
        except ValueError as error:
            raise HTTPException(400, "The application upload size is invalid.") from error
        if request_bytes < 0:
            raise HTTPException(400, "The application upload size is invalid.")
        if request_bytes > MAX_APPLICATION_REQUEST_BYTES:
            raise HTTPException(413, "The application upload must be 16 MB or smaller.")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
        raise HTTPException(415, "Submit maker applications with the photo upload form.")

    form = await request.form(max_files=3, max_fields=20)
    allowed_fields = set(MakerApplicationFields.model_fields) | {"productPhotos"}
    if set(form.keys()) - allowed_fields:
        raise HTTPException(422, "The application contains unsupported fields.")
    try:
        fields = MakerApplicationFields.model_validate({
            name: form.get(name) for name in MakerApplicationFields.model_fields
        })
    except ValidationError as error:
        raise RequestValidationError(error.errors()) from error

    photo_uploads = form.getlist("productPhotos")
    if not 1 <= len(photo_uploads) <= 3 or not all(
        isinstance(photo, StarletteUploadFile) for photo in photo_uploads
    ):
        raise HTTPException(422, "Add between one and three product photos.")

    optimized_photos = []
    for photo in photo_uploads:
        try:
            content = await photo.read(MAX_SOURCE_PHOTO_BYTES + 1)
            if len(content) > MAX_SOURCE_PHOTO_BYTES:
                raise HTTPException(413, "Each photo must be 5 MB or smaller.")
            optimized_photos.append(normalize_maker_photo(content, photo.content_type or ""))
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        finally:
            await photo.close()

    application_id = uuid4()
    try:
        photo_paths = await upload_maker_application_photos(application_id, optimized_photos)
    except MakerPhotoStorageError as error:
        raise HTTPException(503, str(error)) from error

    try:
        payload = MakerApplicationCreate.model_validate({
            **fields.model_dump(mode="json"),
            "productPhotos": photo_paths,
        })
    except ValidationError as error:
        try:
            await delete_maker_application_photos(photo_paths)
        except MakerPhotoStorageError as cleanup_error:
            logger.warning("Unused maker photo cleanup failed (error_type=%s).", type(cleanup_error).__name__)
        raise RequestValidationError(error.errors()) from error

    application = MakerApplication(
        id=application_id,
        maker_name=payload.makerName,
        contact_person=payload.contactPerson,
        email=str(payload.email).lower().strip(),
        country=payload.country,
        city=payload.city,
        website=str(payload.website) if payload.website else "",
        social_media=str(payload.socialMedia) if payload.socialMedia else "",
        product_url=str(payload.productUrl),
        product_description=payload.productDescription,
        proven_desire_evidence=payload.provenDesireEvidence,
        materials=payload.materials,
        price_range=payload.priceRange,
        product_photos=payload.productPhotos,
        ponyo_exclusivity=payload.ponyoExclusivity,
    )
    db.add(application)
    try:
        await db.commit()
    except SQLAlchemyError as error:
        await db.rollback()
        logger.warning("Maker application save failed; uploaded photos were retained because commit outcome may be uncertain.")
        raise HTTPException(500, "The maker application could not be saved.") from error
    await db.refresh(application)
    details = "\n".join((
        f"Location: {application.city}, {application.country}",
        f"Website: {application.website or 'Not provided'}",
        f"Social media: {application.social_media or 'Not provided'}",
        f"Product: {application.product_url}",
        f"Description: {application.product_description}",
        f"Demand evidence: {application.proven_desire_evidence}",
        f"Materials: {application.materials}",
        f"Price range: {application.price_range}",
        f"Ponyo exclusivity: {application.ponyo_exclusivity}",
    ))
    await send_partner_application_notification(
        application.maker_name, application.contact_person, application.email, details,
    )
    return {"data": {"id": str(application.id), "status": application.status}}
