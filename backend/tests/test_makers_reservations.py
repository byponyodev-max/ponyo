from io import BytesIO
from uuid import UUID, uuid4

import pytest
from openpyxl import load_workbook
from PIL import Image
from pydantic import ValidationError
from sqlalchemy import func, select

from app.models import Brand, Customer, EmailNotification, MakerApplication, OutboxEvent, Product, ProductCategory, ProductInterest, ProductReservation
from app.maker_application_storage import MAX_STORED_PHOTO_BYTES, normalize_maker_photo
from app.routers.admin import safe_csv_cell
from app.schemas import MakerApplicationFields
from app.security import hash_password
from test_api import (
    add_product,
    csrf_token,
    safe_auth_email_and_cookies as safe_auth_email_and_cookies,
    seed_customer_session,
    test_client,
)

pytestmark = pytest.mark.asyncio


async def test_maker_application_photos_are_reencoded_as_small_jpegs():
    image = BytesIO()
    Image.new("RGBA", (1800, 1200), (218, 164, 134, 180)).save(image, format="PNG")

    optimized = normalize_maker_photo(image.getvalue(), "image/png")

    assert optimized.startswith(b"\xff\xd8\xff")
    assert len(optimized) <= MAX_STORED_PHOTO_BYTES
    with pytest.raises(ValueError, match="valid supported image"):
        normalize_maker_photo(b"not an image", "image/jpeg")


async def test_reservation_csv_escapes_spreadsheet_formulas():
    assert safe_csv_cell("=HYPERLINK(\"https://example.com\")") == "'=HYPERLINK(\"https://example.com\")"
    assert safe_csv_cell("  @SUM(A1:A2)") == "'  @SUM(A1:A2)"


@pytest.mark.parametrize(
    ("price_range", "valid"),
    [
        ("JPY 8,000–12,000", True),
        ("KRW 1000–2000", True),
        ("USD 8,000–12,000", False),
        ("JPY 12,000–8,000", False),
        ("JPY 1.5–2.5", False),
    ],
)
async def test_maker_application_price_range_requires_supported_currency_and_ordered_integers(price_range, valid):
    fields = {
        "makerName": "Cloud Stitch Studio",
        "contactPerson": "Mika",
        "email": "maker@example.com",
        "country": "Japan",
        "city": "Tokyo",
        "productUrl": "https://maker.example/plush",
        "productDescription": "A hand-sewn character plush with a considered shape and finish.",
        "provenDesireEvidence": "The last two releases sold out within a day.",
        "materials": "Cotton plush fabric and recycled polyester filling",
        "priceRange": price_range,
        "ponyoExclusivity": "A Ponyo-only colorway could be discussed for a future release.",
    }
    if valid:
        MakerApplicationFields.model_validate(fields)
    else:
        with pytest.raises(ValidationError, match="priceRange"):
            MakerApplicationFields.model_validate(fields)


async def test_product_reservations_are_idempotent_non_binding_and_counted(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="reservation-plush")
    async with factory() as db:
        product = await db.get(Product, product_id)
        product.reservations_open = True
        product.reservation_target = 2
        await db.commit()

    csrf = await csrf_token(client)
    payload = {"email": "Plush.Friend@example.com", "country": "JP"}
    first = await client.post(f"/v1/products/{product_id}/reservations", headers={"X-CSRF-Token": csrf}, json=payload)
    duplicate = await client.post(f"/v1/products/{product_id}/reservations", headers={"X-CSRF-Token": csrf}, json=payload)
    assert first.status_code == duplicate.status_code == 200
    assert first.json()["data"]["reservationCount"] == duplicate.json()["data"]["reservationCount"] == 1
    assert first.json()["data"] == {
        "accepted": True, "reservationCount": 1, "target": 2, "open": True,
        "deadline": None, "productionStatus": "collecting",
    }

    counter = await client.get(f"/v1/products/{product_id}/reservations")
    assert counter.json()["data"] == {
        "reservationCount": 1, "target": 2, "open": True,
        "deadline": None, "productionStatus": "collecting",
    }
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProductReservation)) == 1
        assert await db.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "product.reservation_created")) == 1
        assert await db.scalar(select(func.count()).select_from(MakerApplication)) == 0


async def test_reservations_keep_target_unset_when_product_has_no_custom_target(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="default-target-reservation-plush")
    async with factory() as db:
        product = await db.get(Product, product_id)
        product.reservations_open = True
        await db.commit()

    counter = await client.get(f"/v1/products/{product_id}/reservations")
    assert counter.status_code == 200
    assert counter.json()["data"] == {
        "reservationCount": 0, "target": None, "open": True,
        "deadline": None, "productionStatus": "collecting",
    }

    response = await client.post(
        f"/v1/products/{product_id}/reservations",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"email": "plush-friend@example.com", "country": "JP"},
    )
    assert response.status_code == 200
    assert response.json()["data"] == {
        "accepted": True, "reservationCount": 1, "target": None, "open": True,
        "deadline": None, "productionStatus": "collecting",
    }


async def test_interest_registration_accepts_free_text_unserved_country(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="unserved-country-interest")

    response = await client.post(
        f"/v1/products/{product_id}/interests",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"email": "friend@example.com", "country": "New Zealand"},
    )
    assert response.status_code == 200, response.text
    async with factory() as db:
        entry = await db.scalar(
            select(ProductInterest).where(ProductInterest.product_id == product_id)
        )
        assert entry.country == "New Zealand"
        assert await db.scalar(select(func.count()).select_from(ProductReservation)) == 0


async def test_reservation_and_unserved_interest_are_separate_country_gated_records(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="split-reservation-interest")
    async with factory() as db:
        product = await db.get(Product, product_id)
        product.shipping_countries = ["JP"]
        product.reservations_open = True
        await db.commit()
    csrf = await csrf_token(client)

    reserved = await client.post(
        f"/v1/products/{product_id}/reservations",
        headers={"X-CSRF-Token": csrf},
        json={"email": "friend@example.com", "country": "JP"},
    )
    assert reserved.status_code == 200
    wrong_reservation = await client.post(
        f"/v1/products/{product_id}/reservations",
        headers={"X-CSRF-Token": csrf},
        json={"email": "other@example.com", "country": "KR"},
    )
    assert wrong_reservation.status_code == 409
    wrong_interest = await client.post(
        f"/v1/products/{product_id}/interests",
        headers={"X-CSRF-Token": csrf},
        json={"email": "friend@example.com", "country": "Japan"},
    )
    assert wrong_interest.status_code == 409
    interested = await client.post(
        f"/v1/products/{product_id}/interests",
        headers={"X-CSRF-Token": csrf},
        json={"email": "friend@example.com", "country": "KR"},
    )
    assert interested.status_code == 200

    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProductReservation)) == 1
        assert await db.scalar(select(func.count()).select_from(ProductInterest)) == 1


async def test_reaching_reservation_minimum_notifies_admin_once(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="minimum-reached-plush")
    async with factory() as db:
        product = await db.get(Product, product_id)
        product.reservations_open = True
        product.reservation_target = 2
        await db.commit()

    csrf = await csrf_token(client)
    for email in ("first@example.com", "second@example.com", "second@example.com"):
        response = await client.post(
            f"/v1/products/{product_id}/reservations",
            headers={"X-CSRF-Token": csrf},
            json={"email": email, "country": "JP"},
        )
        assert response.status_code == 200

    async with factory() as db:
        product = await db.get(Product, product_id)
        event = await db.scalar(select(OutboxEvent).where(
            OutboxEvent.event_type == "product.reservation_minimum_reached",
        ))
        assert product.reservation_minimum_reached_at is not None
        assert product.reservations_open is False
        assert product.production_status == "target_reached"
        assert event.payload == {
            "productId": str(product_id),
            "productName": "Minimum-Reached-Plush",
            "reservationCount": 2,
            "target": 2,
        }
        assert await db.scalar(select(func.count()).select_from(OutboxEvent).where(
            OutboxEvent.event_type == "product.reservation_minimum_reached",
        )) == 1

    admin_id = await seed_customer_session(client, factory, email="minimum-admin@example.com")
    async with factory() as db:
        admin = await db.get(Customer, admin_id)
        admin.role = "admin"
        await db.commit()
    overview = await client.get("/v1/admin/reservations")
    row = next(item for item in overview.json()["data"] if item["id"] == str(product_id))
    assert row["reservationMinimumReachedAt"] is not None
    assert row["reservationCount"] == 2


async def test_admin_confirms_maker_readiness_and_queues_non_payment_invitations(test_client, monkeypatch):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="ready-maker-plush")
    async with factory() as db:
        product = await db.get(Product, product_id)
        product.reservation_target = 1
        product.production_status = "target_reached"
        product.reservations_open = False
        db.add(ProductReservation(product_id=product_id, email="reserved@example.com", country="JP"))
        await db.commit()
    admin_id = await seed_customer_session(client, factory, email="ready-maker-admin@example.com")
    async with factory() as db:
        admin = await db.get(Customer, admin_id)
        admin.role = "admin"
        await db.commit()

    from types import SimpleNamespace

    monkeypatch.setattr(
        "app.routers.admin.get_settings",
        lambda: SimpleNamespace(contact_email_configured=True, storefront_base_url="https://byponyo.com"),
    )
    path = f"/v1/admin/products/{product_id}/production-approval"
    response = await client.post(
        path,
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"confirmMakerReady": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"] == {
        "productId": str(product_id),
        "status": "preorder_invited",
        "invitationsQueued": 1,
        "paymentEnabled": False,
    }
    duplicate = await client.post(
        path,
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"confirmMakerReady": True},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["data"]["invitationsQueued"] == 0
    async with factory() as db:
        product = await db.get(Product, product_id)
        notification = await db.scalar(select(EmailNotification))
        assert product.production_status == "preorder_invited"
        assert notification.template == "reservation_preorder_invitation"
        assert notification.payload["productUrl"] == f"https://byponyo.com/products/{product.slug}"


async def test_closed_reservations_reject_submission_without_storing_email(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="closed-reservation-plush")
    response = await client.post(
        f"/v1/products/{product_id}/reservations",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"email": "plush-friend@example.com", "country": "JP"},
    )
    assert response.status_code == 409
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProductReservation)) == 0


async def test_maker_application_is_saved_and_admin_can_manage_status(test_client, monkeypatch):
    client, factory = test_client
    notifications = []
    photo_filenames = [
        "00000000-0000-0000-0000-000000000002.jpg",
        "00000000-0000-0000-0000-000000000003.jpg",
    ]

    async def store_photos(application_id, photos):
        assert len(photos) == 2
        assert all(photo.startswith(b"\xff\xd8\xff") for photo in photos)
        return [f"maker-applications/{application_id}/{filename}" for filename in photo_filenames]

    async def sign_photo(path):
        assert path.startswith("maker-applications/")
        return f"https://project.supabase.co/storage/v1/object/sign/{path}?token=private"

    async def notify_partners(*args):
        notifications.append(args)
        return True

    monkeypatch.setattr("app.routers.makers.send_partner_application_notification", notify_partners)
    monkeypatch.setattr("app.routers.makers.upload_maker_application_photos", store_photos)
    monkeypatch.setattr("app.routers.admin.signed_maker_application_photo_url", sign_photo)
    payload = {
        "makerName": "Cloud Stitch Studio",
        "contactPerson": "Mika",
        "email": "MAKER@example.com",
        "country": "Japan",
        "city": "Tokyo",
        "website": "https://maker.example",
        "socialMedia": "https://social.example/maker",
        "productUrl": "https://maker.example/plush",
        "productDescription": "A hand-sewn character plush with a considered shape and finish.",
        "provenDesireEvidence": "The last two releases sold out within a day.",
        "materials": "Cotton plush fabric and recycled polyester filling",
        "priceRange": "JPY 8,000–12,000",
        "ponyoExclusivity": "A Ponyo-only colorway could be discussed for a future release.",
    }
    image = BytesIO()
    Image.new("RGB", (36, 36), (218, 164, 134)).save(image, format="PNG")
    response = await client.post(
        "/v1/makers/applications",
        headers={"X-CSRF-Token": await csrf_token(client)},
        data=payload,
        files=[
            ("productPhotos", ("plush-front.png", image.getvalue(), "image/png")),
            ("productPhotos", ("plush-back.png", image.getvalue(), "image/png")),
        ],
    )
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "pending"
    assert notifications and notifications[0][0:3] == ("Cloud Stitch Studio", "Mika", "maker@example.com")
    assert "Demand evidence: The last two releases sold out within a day." in notifications[0][3]
    assert (await client.get("/v1/admin/maker-applications")).status_code == 401

    customer_id = await seed_customer_session(client, factory, email="maker-admin@example.com")
    async with factory() as db:
        admin = await db.get(Customer, customer_id)
        admin.role = "admin"
        await db.commit()
    applications = await client.get("/v1/admin/maker-applications")
    assert applications.status_code == 200
    application = applications.json()["data"][0]
    assert application["makerName"] == "Cloud Stitch Studio"
    assert application["email"] == "maker@example.com"
    assert application["productPhotos"] == [
        "https://project.supabase.co/storage/v1/object/sign/maker-applications/"
        + application["id"] + f"/{filename}?token=private"
        for filename in photo_filenames
    ]
    async with factory() as db:
        saved = await db.get(MakerApplication, UUID(application["id"]))
        assert saved.product_photos == [
            f"maker-applications/{application['id']}/{filename}"
            for filename in photo_filenames
        ]

    updated = await client.patch(
        f"/v1/admin/maker-applications/{application['id']}/status",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"status": "reviewing"},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["status"] == "reviewing"


async def test_maker_profile_and_product_proof_only_use_published_real_brand_data(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="verified-maker-plush")
    async with factory() as db:
        product = await db.get(Product, product_id)
        brand = Brand(
            slug="cloud-stitch",
            name="Cloud Stitch Studio",
            maker_story="A small studio focused on character design and careful hand finishing.",
            philosophy="Make each detail feel considered.",
            process="Each prototype is sewn and reviewed in the studio.",
        )
        db.add(brand)
        await db.flush()
        product.brand_id = brand.id
        product.materials = "Cotton plush fabric"
        product.weight_grams = 240
        product.edition_count = 50
        product.only_at_ponyo = True
        await db.commit()

    maker = await client.get("/v1/makers/cloud-stitch")
    assert maker.status_code == 200
    assert maker.json()["data"]["maker"]["story"].startswith("A small studio")
    listed_product = maker.json()["data"]["products"][0]
    assert listed_product["makerName"] == "Cloud Stitch Studio"
    assert listed_product["materials"] == "Cotton plush fabric"
    assert listed_product["weightGrams"] == 240
    assert listed_product["editionCount"] == 50
    assert listed_product["onlyAtPonyo"] is True

    detail = await client.get(f"/v1/products/{product_id}")
    assert detail.json()["data"]["makerSlug"] == "cloud-stitch"
    assert detail.json()["data"]["reservationsOpen"] is False


async def test_populated_demo_maker_profiles_are_publicly_linkable(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="sample-maker-plush")
    async with factory() as db:
        product = await db.get(Product, product_id)
        brand = Brand(
            slug="sample-maker-studio",
            name="Sample Maker Studio",
            is_demo=True,
            maker_story="A clearly labeled sample maker profile for the demo catalog.",
            philosophy="Sample philosophy.",
            process="Sample process.",
        )
        db.add(brand)
        await db.flush()
        product.brand_id = brand.id
        product.materials = "Polyester plush"
        product.only_at_ponyo = True
        await db.commit()

    profile = await client.get("/v1/makers/sample-maker-studio")
    detail = await client.get(f"/v1/products/{product_id}")
    assert profile.status_code == 200
    assert profile.json()["data"]["maker"]["story"].startswith("A clearly labeled sample")
    assert detail.json()["data"]["makerSlug"] == "sample-maker-studio"
    assert detail.json()["data"]["makerName"] == "Sample Maker Studio"
    assert detail.json()["data"]["materials"] == "Polyester plush"
    assert detail.json()["data"]["onlyAtPonyo"] is True


async def test_admin_can_assign_only_active_leaf_product_categories(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="admin-category-plush")
    admin_id = await seed_customer_session(client, factory, email="category-admin@example.com")
    async with factory() as db:
        admin = await db.get(Customer, admin_id)
        admin.role = "admin"
        parent = ProductCategory(id=uuid4(), slug="plush-toys", name="Plush Toys", active=True)
        child = ProductCategory(
            id=uuid4(), slug="collectible-plush", name="Collectible Plush",
            parent_id=parent.id, active=True,
        )
        db.add_all([parent, child])
        await db.commit()
    csrf = await csrf_token(client)

    parent_assignment = await client.patch(
        f"/v1/admin/products/{product_id}/category",
        headers={"X-CSRF-Token": csrf},
        json={"categoryId": str(parent.id)},
    )
    assert parent_assignment.status_code == 422

    assignment = await client.patch(
        f"/v1/admin/products/{product_id}/category",
        headers={"X-CSRF-Token": csrf},
        json={"categoryId": str(child.id)},
    )
    assert assignment.status_code == 200
    assert assignment.json()["data"]["categoryId"] == str(child.id)
    assert assignment.json()["data"]["categoryName"] == "Collectible Plush"
    assert assignment.json()["data"]["categorySlug"] == "collectible-plush"


async def test_admin_can_configure_product_proof_and_reservation_counter(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="admin-proof-plush")
    assert (await client.get("/v1/admin/reservations/entries")).status_code == 401
    admin_id = await seed_customer_session(client, factory, email="proof-admin@example.com")
    async with factory() as db:
        admin = await db.get(Customer, admin_id)
        admin.role = "admin"
        await db.commit()
    csrf = await csrf_token(client)

    proof = await client.patch(
        f"/v1/admin/products/{product_id}/proof",
        headers={"X-CSRF-Token": csrf},
        json={
            "materials": "Wool blend fabric",
            "weightGrams": 300,
            "editionCount": 24,
            "estimatedDeliveryDate": "2027-01-15",
            "onlyAtPonyo": True,
            "shippingCountries": ["JP", "KR"],
        },
    )
    assert proof.status_code == 200
    assert proof.json()["data"]["editionCount"] == 24
    assert proof.json()["data"]["onlyAtPonyo"] is True
    assert proof.json()["data"]["shippingCountries"] == ["JP", "KR"]

    invalid_shipping = await client.patch(
        f"/v1/admin/products/{product_id}/proof",
        headers={"X-CSRF-Token": csrf},
        json={"shippingCountries": ["US"]},
    )
    assert invalid_shipping.status_code == 422

    settings = await client.patch(
        f"/v1/admin/products/{product_id}/reservations",
        headers={"X-CSRF-Token": csrf},
        json={"reservationsOpen": True, "reservationTarget": 40, "reservationDeadline": None},
    )
    assert settings.status_code == 200
    assert settings.json()["data"]["reservationTarget"] == 40
    for email, country in (
        ("one@example.com", "JP"),
        ("two@example.com", "JP"),
        ("three@example.com", "KR"),
    ):
        response = await client.post(
            f"/v1/products/{product_id}/reservations",
            headers={"X-CSRF-Token": csrf},
            json={"email": email, "country": country},
        )
        assert response.status_code == 200

    overview = await client.get("/v1/admin/reservations")
    row = next(item for item in overview.json()["data"] if item["id"] == str(product_id))
    assert row["reservationCount"] == 3
    assert row["reservationsOpen"] is True
    assert row["reservationsByCountry"] == [
        {"country": "JP", "count": 2},
        {"country": "KR", "count": 1},
    ]

    interest = await client.post(
        f"/v1/products/{product_id}/interests",
        headers={"X-CSRF-Token": csrf},
        json={"email": "interest@example.com", "country": "AU"},
    )
    assert interest.status_code == 200
    interest_overview = await client.get("/v1/admin/interests")
    interest_row = next(item for item in interest_overview.json()["data"] if item["id"] == str(product_id))
    assert interest_row["interestCount"] == 1
    assert interest_row["interestsByCountry"] == [{"country": "AU", "count": 1}]

    entries = await client.get(
        "/v1/admin/reservations/entries",
        params={"productId": str(product_id), "country": "JP", "q": "one@example.com"},
    )
    assert entries.status_code == 200
    assert entries.json()["data"]["total"] == 1
    assert entries.json()["data"]["items"][0]["email"] == "one@example.com"
    assert entries.json()["data"]["items"][0]["productName"] == "Admin-Proof-Plush"

    export = await client.get("/v1/admin/reservations/export.csv", params={"productId": str(product_id), "country": "KR"})
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    assert "no-store" in export.headers["cache-control"]
    assert "three@example.com" in export.text
    assert "one@example.com" not in export.text

    workbook_export = await client.get(
        "/v1/admin/reservations/export.xlsx",
        params={"productId": str(product_id), "country": "KR"},
    )
    assert workbook_export.status_code == 200
    assert workbook_export.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert "no-store" in workbook_export.headers["cache-control"]
    assert workbook_export.headers["x-export-row-count"] == "1"
    sheet = load_workbook(BytesIO(workbook_export.content), data_only=True).active
    assert sheet.freeze_panes == "A7"
    assert sheet.auto_filter.ref == "A6:E7"
    assert sheet["A3"].value == f"Filters: Product ID: {product_id} · Country: KR"
    assert sheet["A7"].value
    assert sheet["B7"].value == "Admin-Proof-Plush"
    assert sheet["C7"].value == "three@example.com"

    public = await client.get(f"/v1/products/{product_id}/reservations")
    assert public.json()["data"] == {
        "reservationCount": 3, "target": 40, "open": True,
        "deadline": None, "productionStatus": "collecting",
    }
