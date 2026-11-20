from datetime import datetime, timezone
from urllib.parse import quote
from uuid import UUID

import jwt

from app.config import get_settings
from app.models import NewsletterSubscription


def _utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def consent_timestamp(subscription: NewsletterSubscription) -> int:
    created_at = _utc_datetime(subscription.created_at)
    elapsed = created_at - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return elapsed.days * 86_400_000_000 + elapsed.seconds * 1_000_000 + elapsed.microseconds


def unsubscribe_token(subscription: NewsletterSubscription) -> str:
    settings = get_settings()
    payload = {
        "iss": settings.jwt_issuer,
        "sub": str(subscription.id),
        "purpose": "newsletter-unsubscribe",
        "consentAt": consent_timestamp(subscription),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def unsubscribe_url(subscription: NewsletterSubscription) -> str:
    settings = get_settings()
    token = quote(unsubscribe_token(subscription), safe="")
    return f"{settings.storefront_base_url.rstrip('/')}/newsletter/unsubscribe?token={token}"


def subscription_from_unsubscribe_token(token: str) -> tuple[UUID, int]:
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=["HS256"],
        issuer=settings.jwt_issuer,
        options={"require": ["sub", "iss", "iat"]},
    )
    if payload.get("purpose") != "newsletter-unsubscribe":
        raise jwt.InvalidTokenError("Invalid newsletter unsubscribe purpose.")
    if not isinstance(payload.get("consentAt"), int):
        raise jwt.InvalidTokenError("Invalid newsletter consent timestamp.")
    try:
        subscription_id = UUID(payload["sub"])
    except (ValueError, TypeError, AttributeError) as error:
        raise jwt.InvalidTokenError("Invalid newsletter subscription ID.") from error
    return subscription_id, payload["consentAt"]
