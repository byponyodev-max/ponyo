"""Public maker profiles and maker applications."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.email_notifications import send_partner_application_notification
from app.models import Brand, MakerApplication, Product
from app.rate_limit import enforce_rate_limit
from app.routers.products import product_response
from app.schemas import MakerApplicationCreate
from app.security import require_csrf
from app.translations import TRANSLATION_LOCALES, TranslationUnavailableError, _get_nested, get_product_translation

router = APIRouter(prefix="/makers", tags=["makers"])


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
    payload: MakerApplicationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "maker-application", 5, 3600)
    application = MakerApplication(
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
    await db.commit()
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
