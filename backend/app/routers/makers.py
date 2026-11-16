"""Public maker profiles and maker applications."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import Brand, MakerApplication, Product
from app.rate_limit import enforce_rate_limit
from app.routers.products import product_response
from app.schemas import MakerApplicationCreate
from app.security import require_csrf

router = APIRouter(prefix="/makers", tags=["makers"])


@router.get("/{slug}", response_model=dict)
async def get_maker_profile(slug: str, db: AsyncSession = Depends(get_db)):
    maker = await db.scalar(select(Brand).where(Brand.slug == slug, Brand.is_demo.is_(False)))
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
    return {"data": {
        "maker": {
            "id": str(maker.id),
            "slug": maker.slug,
            "name": maker.name,
            "profileImageUrl": maker.profile_image_url,
            "story": maker.maker_story,
            "philosophy": maker.philosophy,
            "process": maker.process,
            "location": maker.location,
            "specialties": maker.specialties or [],
            "website": maker.website,
            "socialMedia": maker.social_media,
        },
        "products": [product_response(product).model_dump(mode="json") for product in products],
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
    return {"data": {"id": str(application.id), "status": application.status}}
