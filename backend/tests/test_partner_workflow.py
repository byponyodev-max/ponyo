from urllib.parse import urlparse, parse_qs
from uuid import UUID

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import (
    Brand,
    Customer,
    EmailNotification,
    MakerApplication,
    MakerOnboarding,
    Supplier,
    SupplierAccount,
    utc_now,
)
from app.security import create_session_token, hash_password, verify_password
from test_api import csrf_token, test_client

pytestmark = pytest.mark.asyncio


async def test_maker_application_to_partner_activation_is_separate_and_one_time(test_client, monkeypatch):
    client, factory = test_client
    monkeypatch.setattr(settings, "smtp_host", "mail.example.test")
    monkeypatch.setattr(settings, "smtp_from_email", "partners@byponyo.com")
    monkeypatch.setattr(settings, "storefront_base_url", "http://localhost:3000")
    async with factory() as db:
        admin = Customer(
            email="admin@example.com",
            password_hash=hash_password("admin-password-123"),
            email_verified=True,
            role="admin",
        )
        existing_customer = Customer(
            email="maker@example.com",
            first_name="Mina",
            last_name="Maker",
            password_hash=hash_password("existing-password-123"),
            email_verified=False,
            role="customer",
        )
        application = MakerApplication(
            maker_name="Little Moon Studio",
            contact_person="Mina Maker",
            email="maker@example.com",
            country="Japan",
            city="Tokyo",
            product_url="https://example.test/products",
            product_description="Handmade character plush for collectors.",
            proven_desire_evidence="Customers have requested this product.",
            materials="Cotton and recycled filling.",
            price_range="¥5,000–¥8,000",
            ponyo_exclusivity="Non-exclusive",
        )
        db.add_all([admin, existing_customer, application])
        await db.commit()
        admin_id = admin.id
        application_id = application.id

    client.cookies.set(settings.session_cookie_name, create_session_token(admin_id))
    accepted = await client.patch(
        f"/v1/admin/maker-applications/{application_id}/status",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"status": "accepted"},
    )
    assert accepted.status_code == 200, accepted.text

    async with factory() as db:
        onboarding = await db.scalar(select(MakerOnboarding).where(MakerOnboarding.application_id == application_id))
        invitation = await db.scalar(select(EmailNotification).where(EmailNotification.template == "maker_onboarding_invitation"))
        assert onboarding.status == "invited"
        assert onboarding.invite_token_hash
        assert invitation.recipient == "maker@example.com"
        onboarding_url = invitation.payload["inviteUrl"]
    onboarding_token = parse_qs(urlparse(onboarding_url).query)["token"][0]

    opened = await client.get(f"/v1/maker-onboarding/{onboarding_token}")
    assert opened.status_code == 200
    assert opened.json()["data"]["makerName"] == "Little Moon Studio"
    submitted = await client.post(
        f"/v1/maker-onboarding/{onboarding_token}",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={
            "brandStory": "A small Tokyo studio making imaginative handmade plush.",
            "philosophy": "Make thoughtful keepsakes that bring comfort.",
            "process": "Each piece is sketched, sewn, and checked by hand.",
            "specialties": ["Hand embroidery"],
            "productCategories": ["Plush Toys"],
            "productionCapacity": 25,
            "shippingMethod": "Tracked international parcel service.",
            "shippingResponsibility": "maker",
            "returnPolicy": "Damaged products are replaced after review.",
            "exclusivityTerms": "Products remain non-exclusive unless agreed in writing.",
            "acceptTerms": True,
        },
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["data"]["status"] == "pending_review"

    reviewed = await client.patch(
        f"/v1/admin/maker-onboardings/{onboarding.id}/decision",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"decision": "approve"},
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["data"]["status"] == "approved"
    async with factory() as db:
        supplier = await db.get(Supplier, UUID(reviewed.json()["data"]["supplierId"]))
        brand = await db.get(Brand, UUID(reviewed.json()["data"]["brandId"]))
        invitation = await db.scalar(select(EmailNotification).where(EmailNotification.template == "supplier_portal_invitation"))
        onboarding = await db.get(MakerOnboarding, onboarding.id)
        assert supplier.active is False
        assert brand.maker_story == "A small Tokyo studio making imaginative handmade plush."
        assert onboarding.supplier_id == supplier.id
        assert invitation.recipient == "maker@example.com"
        supplier_token = parse_qs(urlparse(invitation.payload["inviteUrl"]).query)["token"][0]

    activation = await client.post(
        "/v1/supplier-auth/invitations/accept",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"token": supplier_token, "firstName": "Mina", "lastName": "Maker"},
    )
    assert activation.status_code == 200, activation.text
    assert activation.json()["data"]["supplier"]["id"] == reviewed.json()["data"]["supplierId"]
    assert (await client.get("/v1/supplier-auth/me")).status_code == 200
    assert (await client.get("/v1/auth/me")).status_code == 200
    async with factory() as db:
        account = await db.scalar(select(Customer).where(Customer.email == "maker@example.com"))
        supplier = await db.get(Supplier, UUID(reviewed.json()["data"]["supplierId"]))
        onboarding = await db.get(MakerOnboarding, onboarding.id)
        binding = await db.get(SupplierAccount, account.id)
        assert account.role == "customer"
        assert account.email_verified is True
        assert verify_password("existing-password-123", account.password_hash)
        assert supplier.active is True
        assert binding.supplier_id == supplier.id
        assert onboarding.supplier_invite_used_at is not None

    reused = await client.post(
        "/v1/supplier-auth/invitations/accept",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"token": supplier_token, "firstName": "Mina", "lastName": "Maker"},
    )
    assert reused.status_code == 410
