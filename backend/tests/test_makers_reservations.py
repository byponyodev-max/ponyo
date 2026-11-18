import pytest
from sqlalchemy import func, select

from app.models import Brand, Customer, MakerApplication, OutboxEvent, Product, ProductReservation
from app.routers.admin import safe_csv_cell
from app.security import hash_password
from test_api import add_product, csrf_token, seed_customer_session, test_client

pytestmark = pytest.mark.asyncio


async def test_reservation_csv_escapes_spreadsheet_formulas():
    assert safe_csv_cell("=HYPERLINK(\"https://example.com\")") == "'=HYPERLINK(\"https://example.com\")"
    assert safe_csv_cell("  @SUM(A1:A2)") == "'  @SUM(A1:A2)"


async def test_product_reservations_are_idempotent_non_binding_and_counted(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="reservation-plush")
    async with factory() as db:
        product = await db.get(Product, product_id)
        product.reservations_open = True
        product.reservation_target = 2
        await db.commit()

    csrf = await csrf_token(client)
    payload = {"email": "Plush.Friend@example.com", "country": "Japan"}
    first = await client.post(f"/v1/products/{product_id}/reservations", headers={"X-CSRF-Token": csrf}, json=payload)
    duplicate = await client.post(f"/v1/products/{product_id}/reservations", headers={"X-CSRF-Token": csrf}, json=payload)
    assert first.status_code == duplicate.status_code == 200
    assert first.json()["data"]["reservationCount"] == duplicate.json()["data"]["reservationCount"] == 1
    assert first.json()["data"]["target"] == 2

    counter = await client.get(f"/v1/products/{product_id}/reservations")
    assert counter.json()["data"] == {"reservationCount": 1, "target": 2, "open": True}
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProductReservation)) == 1
        assert await db.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.event_type == "product.reservation_created")) == 1
        assert await db.scalar(select(func.count()).select_from(MakerApplication)) == 0


async def test_closed_reservations_reject_submission_without_storing_email(test_client):
    client, factory = test_client
    product_id, _ = await add_product(factory, slug="closed-reservation-plush")
    response = await client.post(
        f"/v1/products/{product_id}/reservations",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"email": "plush-friend@example.com", "country": "Japan"},
    )
    assert response.status_code == 409
    async with factory() as db:
        assert await db.scalar(select(func.count()).select_from(ProductReservation)) == 0


async def test_maker_application_is_saved_and_admin_can_manage_status(test_client, monkeypatch):
    client, factory = test_client
    notifications = []

    async def notify_partners(*args):
        notifications.append(args)
        return True

    monkeypatch.setattr("app.routers.makers.send_partner_application_notification", notify_partners)
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
        "productPhotos": ["data:image/jpeg;base64,/9j/AA=="],
        "ponyoExclusivity": "A Ponyo-only colorway could be discussed for a future release.",
    }
    response = await client.post(
        "/v1/makers/applications",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json=payload,
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
    assert application["productPhotos"] == payload["productPhotos"]

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
        },
    )
    assert proof.status_code == 200
    assert proof.json()["data"]["editionCount"] == 24
    assert proof.json()["data"]["onlyAtPonyo"] is True

    settings = await client.patch(
        f"/v1/admin/products/{product_id}/reservations",
        headers={"X-CSRF-Token": csrf},
        json={"reservationsOpen": True, "reservationTarget": 40},
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

    entries = await client.get(
        "/v1/admin/reservations/entries",
        params={"productId": str(product_id), "country": "JP", "q": "one@example.com"},
    )
    assert entries.status_code == 200
    assert entries.json()["data"]["total"] == 1
    assert entries.json()["data"]["items"][0]["email"] == "one@example.com"
    assert entries.json()["data"]["items"][0]["productName"] == "Admin Proof Plush"

    export = await client.get("/v1/admin/reservations/export.csv", params={"productId": str(product_id), "country": "KR"})
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("text/csv")
    assert "no-store" in export.headers["cache-control"]
    assert "three@example.com" in export.text
    assert "one@example.com" not in export.text

    public = await client.get(f"/v1/products/{product_id}/reservations")
    assert public.json()["data"] == {"reservationCount": 3, "target": 40, "open": True}
