"""Supplier-only sign-in and identity endpoints for the supplier portal."""

import secrets

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Customer, Supplier, SupplierAccount
from app.rate_limit import enforce_rate_limit
from app.schemas import AuthCredentials
from app.security import (
    clear_session_cookie,
    require_csrf,
    require_roles,
    session_identity,
    set_session_cookie,
    verify_password,
)

router = APIRouter(prefix="/supplier-auth", tags=["supplier portal authentication"])


async def supplier_identity(db: AsyncSession, customer: Customer) -> dict:
    binding = await db.get(SupplierAccount, customer.id)
    supplier = await db.get(Supplier, binding.supplier_id) if binding else None
    if not supplier or not supplier.active:
        raise HTTPException(403, "This account has no active supplier portal assignment.")
    return {
        "user": {
            "id": str(customer.id),
            "firstName": customer.first_name,
            "lastName": customer.last_name,
            "email": customer.email,
        },
        "supplier": {"id": str(supplier.id), "code": supplier.code, "name": supplier.name},
    }


@router.post("/login", response_model=dict)
async def supplier_login(
    payload: AuthCredentials,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    await enforce_rate_limit(request, "supplier-login", 10, 60)
    customer = await db.scalar(
        select(Customer).where(func.lower(Customer.email) == str(payload.email).lower().strip())
    )
    if not customer or not verify_password(payload.password, customer.password_hash):
        raise HTTPException(401, "Supplier email or password is incorrect.")
    if not customer.email_verified:
        raise HTTPException(403, "Please verify your email before signing in.")
    if customer.role != "supplier":
        raise HTTPException(403, "This sign-in is for supplier accounts only.")
    identity = await supplier_identity(db, customer)
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
    return {"data": identity}


@router.get("/me", response_model=dict)
async def supplier_me(
    customer: Customer = Depends(require_roles("supplier")),
    db: AsyncSession = Depends(get_db),
):
    return {"data": await supplier_identity(db, customer)}


@router.post("/logout", response_model=dict)
async def supplier_logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    require_csrf(request)
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        try:
            customer_id, version = session_identity(token)
        except (jwt.InvalidTokenError, KeyError, ValueError, TypeError, AttributeError):
            customer_id = None
        if customer_id is not None:
            await db.execute(
                update(Customer)
                .where(Customer.id == customer_id, Customer.auth_version == version)
                .values(auth_version=Customer.auth_version + 1)
            )
            await db.commit()
    clear_session_cookie(response)
    response.delete_cookie(settings.csrf_cookie_name, domain=settings.cookie_domain, path="/")
    return {"data": {"accepted": True}}