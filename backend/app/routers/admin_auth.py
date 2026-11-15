"""Admin-only authentication surface for the Ponyo operations dashboard."""

import secrets

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Customer
from app.rate_limit import enforce_rate_limit
from app.schemas import AuthCredentials
from app.security import clear_session_cookie, require_csrf, require_roles, session_identity, set_session_cookie, verify_password

router = APIRouter(prefix="/admin-auth", tags=["admin authentication"])


def admin_identity(admin: Customer) -> dict:
    return {
        "id": str(admin.id),
        "firstName": admin.first_name,
        "lastName": admin.last_name,
        "email": admin.email,
        "role": admin.role,
    }


@router.post("/login", response_model=dict)
async def admin_login(payload: AuthCredentials, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    await enforce_rate_limit(request, "admin-login", 10, 60)
    admin = await db.scalar(select(Customer).where(func.lower(Customer.email) == str(payload.email).lower().strip()))
    if not admin or not verify_password(payload.password, admin.password_hash):
        raise HTTPException(401, "Admin email or password is incorrect.")
    if not admin.email_verified:
        raise HTTPException(403, "This admin account has not been verified.")
    if admin.role != "admin":
        raise HTTPException(403, "This sign-in is for Ponyo admin accounts only.")
    set_session_cookie(response, admin.id, admin.auth_version)
    response.set_cookie(
        settings.csrf_cookie_name,
        secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path="/",
    )
    return {"data": {"user": admin_identity(admin)}}


@router.get("/me", response_model=dict)
async def admin_me(admin: Customer = Depends(require_roles("admin"))):
    return {"data": {"user": admin_identity(admin)}}


@router.post("/logout", response_model=dict)
async def admin_logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    require_csrf(request)
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        try:
            admin_id, version = session_identity(token)
        except (jwt.InvalidTokenError, KeyError, ValueError, TypeError, AttributeError):
            admin_id = None
        if admin_id is not None:
            await db.execute(
                update(Customer)
                .where(Customer.id == admin_id, Customer.auth_version == version, Customer.role == "admin")
                .values(auth_version=Customer.auth_version + 1)
            )
            await db.commit()
    clear_session_cookie(response)
    response.delete_cookie(settings.csrf_cookie_name, domain=settings.cookie_domain, path="/")
    return {"data": {"accepted": True}}
