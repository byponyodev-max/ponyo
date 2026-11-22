"""Public, one-time-token endpoints for partner onboarding and supplier activation."""

import hashlib
import secrets
from datetime import timedelta
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.email_queue import enqueue_email_notification
from app.models import Customer, MakerApplication, MakerOnboarding, OutboxEvent, Supplier, SupplierAccount, utc_now
from app.rate_limit import enforce_rate_limit
from app.schemas import MakerOnboardingSubmit, SupplierInvitationAccept
from app.security import hash_password, require_csrf, set_session_cookie

router = APIRouter(tags=["partner onboarding"])
INVITE_TTL = timedelta(days=14)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _valid_until(expires_at) -> bool:
    if expires_at is None:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > utc_now()


@router.get("/maker-onboarding/{token}", response_model=dict)
async def get_maker_onboarding(token: str, db: AsyncSession = Depends(get_db)):
    onboarding = await db.scalar(select(MakerOnboarding).where(
        MakerOnboarding.invite_token_hash == _token_hash(token),
    ))
    if not onboarding or not _valid_until(onboarding.invite_expires_at):
        raise HTTPException(404, "This onboarding invitation is invalid or has expired.")
    if onboarding.status not in {"invited", "in_progress"} or onboarding.invite_used_at:
        raise HTTPException(410, "This onboarding invitation can no longer be used.")
    application = await db.get(MakerApplication, onboarding.application_id)
    if not application or application.status != "accepted":
        raise HTTPException(410, "This onboarding invitation can no longer be used.")
    if not settings.contact_email_configured:
        raise HTTPException(503, "Transactional email is not configured.")
    return {"data": {
        "makerName": application.maker_name,
        "contactPerson": application.contact_person,
        "email": application.email,
        "status": onboarding.status,
    }}


@router.post("/maker-onboarding/{token}", response_model=dict)
async def submit_maker_onboarding(
    token: str,
    payload: MakerOnboardingSubmit,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "maker-onboarding-submit", 10, 3600)
    onboarding = await db.scalar(select(MakerOnboarding).where(
        MakerOnboarding.invite_token_hash == _token_hash(token),
    ).with_for_update())
    if not onboarding or not _valid_until(onboarding.invite_expires_at):
        raise HTTPException(404, "This onboarding invitation is invalid or has expired.")
    if onboarding.status not in {"invited", "in_progress"} or onboarding.invite_used_at:
        raise HTTPException(410, "This onboarding invitation can no longer be used.")
    application = await db.get(MakerApplication, onboarding.application_id)
    if not application or application.status != "accepted":
        raise HTTPException(410, "This onboarding invitation can no longer be used.")
    onboarding.brand_story = payload.brandStory
    onboarding.philosophy = payload.philosophy
    onboarding.process = payload.process
    onboarding.specialties = list(dict.fromkeys(item.strip() for item in payload.specialties if item.strip()))
    onboarding.product_categories = list(dict.fromkeys(item.strip() for item in payload.productCategories if item.strip()))
    if not onboarding.specialties or not onboarding.product_categories:
        raise HTTPException(422, "Add at least one specialty and product category.")
    onboarding.production_capacity = payload.productionCapacity
    onboarding.shipping_method = payload.shippingMethod
    onboarding.shipping_responsibility = payload.shippingResponsibility
    onboarding.return_policy = payload.returnPolicy
    onboarding.exclusivity_terms = payload.exclusivityTerms
    onboarding.terms_accepted_at = utc_now()
    onboarding.submitted_at = utc_now()
    onboarding.status = "pending_review"
    enqueue_email_notification(
        db,
        OutboxEvent(
            event_type="maker.onboarding_review_requested",
            payload={"applicationId": str(application.id), "onboardingId": str(onboarding.id)},
        ),
        template="maker_onboarding_review_requested",
        recipient=settings.partners_notification_email,
        payload={
            "makerName": application.maker_name,
            "reviewUrl": f"{settings.storefront_base_url.rstrip('/')}/admin-portal",
        },
        notification_key=f"maker_onboarding_review:{onboarding.id}",
    )
    await db.commit()
    return {"data": {"status": onboarding.status}}


@router.post("/supplier-auth/invitations/accept", response_model=dict)
async def accept_supplier_invitation(
    payload: SupplierInvitationAccept,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "supplier-invitation-accept", 10, 3600)
    onboarding = await db.scalar(select(MakerOnboarding).where(
        MakerOnboarding.supplier_invite_token_hash == _token_hash(payload.token),
    ).with_for_update())
    if not onboarding or not _valid_until(onboarding.supplier_invite_expires_at):
        raise HTTPException(404, "This supplier invitation is invalid or has expired.")
    if onboarding.status != "approved" or onboarding.supplier_invite_used_at or not onboarding.supplier_id:
        raise HTTPException(410, "This supplier invitation can no longer be used.")
    application = await db.get(MakerApplication, onboarding.application_id)
    supplier = await db.get(Supplier, onboarding.supplier_id)
    if not application or not supplier:
        raise HTTPException(409, "Supplier setup is incomplete. Contact Ponyo.")
    email = application.email.strip().lower()
    customer = await db.scalar(select(Customer).where(func.lower(Customer.email) == email).with_for_update())
    if customer is None:
        if not payload.password:
            raise HTTPException(422, "Set a password to create your Supplier Portal account.")
        customer = Customer(
            email=email,
            first_name=payload.firstName,
            last_name=payload.lastName,
            password_hash=hash_password(payload.password),
            email_verified=True,
            role="customer",
        )
        db.add(customer)
        await db.flush()
    elif customer.role == "admin":
        raise HTTPException(409, "An administrator account cannot be assigned as a supplier account.")
    binding = await db.get(SupplierAccount, customer.id)
    if binding and binding.supplier_id != supplier.id:
        raise HTTPException(409, "This account is already assigned to another supplier.")
    if not binding:
        db.add(SupplierAccount(customer_id=customer.id, supplier_id=supplier.id))
    customer.email_verified = True
    supplier.active = True
    onboarding.supplier_account_id = customer.id
    onboarding.supplier_invite_used_at = utc_now()
    await db.commit()
    set_session_cookie(response, customer.id, customer.auth_version)
    response.set_cookie(
        settings.csrf_cookie_name,
        secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return {"data": {
        "user": {
            "id": str(customer.id),
            "firstName": customer.first_name,
            "lastName": customer.last_name,
            "email": customer.email,
        },
        "supplier": {"id": str(supplier.id), "code": supplier.code, "name": supplier.name},
    }}
