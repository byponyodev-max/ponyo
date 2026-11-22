import pytest
from sqlalchemy import select
from sqlalchemy import select

from app.models import (
    Customer,
    ProductVariant,
    Supplier,
    SupplierAccount,
    SupplierInventory,
    SupplierOffer,
)
from test_api import add_product, csrf_token, seed_customer_session, test_client

pytestmark = pytest.mark.asyncio


async def create_supplier_listing(client, factory):
    customer_id = await seed_customer_session(client, factory, email="catalog-supplier@example.com")
    product_id, variant_id = await add_product(
        factory, slug="approved-supplier-plush", stock=0, price=1500,
    )
    async with factory() as db:
        customer = await db.get(Customer, customer_id)
        customer.role = "supplier"
        supplier = Supplier(code="CATALOG-SUPPLIER", name="Catalog Studio", active=True)
        db.add(supplier)
        await db.flush()
        db.add(SupplierAccount(customer_id=customer_id, supplier_id=supplier.id))
        offer = SupplierOffer(
            supplier_id=supplier.id,
            variant_id=variant_id,
            supplier_sku="CAT-SKU-1",
            cost_amount=600,
            currency="JPY",
            minimum_order_quantity=1,
            lead_time_days=4,
            is_primary=True,
            active=True,
        )
        db.add(offer)
        await db.flush()
        inventory = SupplierInventory(offer_id=offer.id, on_hand=0, reserved=0)
        db.add(inventory)
        await db.commit()
        offer_id = offer.id
        supplier_id = supplier.id

    response = await client.post(
        "/v1/supplier-auth/login",
        json={"email": "catalog-supplier@example.com", "password": "valid-password-123"},
        headers={"X-CSRF-Token": await csrf_token(client)},
    )
    assert response.status_code == 200, response.text
    return product_id, variant_id, offer_id, supplier_id


async def supplier_update(client, offer_id, body):
    return await client.patch(
        f"/v1/supplier-catalog/offers/{offer_id}",
        json=body,
        headers={"X-CSRF-Token": await csrf_token(client)},
    )


async def test_supplier_offer_updates_are_persisted_and_refresh_storefront_availability(test_client):
    client, factory = test_client
    product_id, variant_id, offer_id, _ = await create_supplier_listing(client, factory)

    before = await client.get(f"/v1/products/{product_id}")
    assert before.status_code == 200
    assert before.json()["data"]["availability"] == "unavailable"

    listings = await client.get("/v1/supplier-catalog/offers")
    assert listings.status_code == 200
    assert len(listings.json()["data"]) == 1
    assert listings.json()["data"][0]["retailPriceAmount"] == 1500

    response = await supplier_update(client, offer_id, {
        "productionCapacity": 8,
        "costAmount": 725,
        "minimumOrderQuantity": 2,
        "leadTimeDays": 3,
    })
    assert response.status_code == 200, response.text
    assert response.json()["data"]["availableQuantity"] == 0
    assert response.json()["data"]["retailPriceAmount"] == 1500
    assert response.json()["data"]["pendingChange"]["productionCapacity"] == 8

    async with factory() as db:
        offer = await db.get(SupplierOffer, offer_id)
        inventory = await db.scalar(
            select(SupplierInventory).where(SupplierInventory.offer_id == offer_id),
        )
        variant = await db.get(ProductVariant, variant_id)
        assert (offer.cost_amount, offer.minimum_order_quantity, offer.lead_time_days) == (600, 1, 4)
        assert inventory.on_hand == 0
        assert inventory.reserved == 0
        assert inventory.last_synced_at is None
        assert variant.stock_quantity == 0

    client.cookies.clear()
    admin_id = await seed_customer_session(client, factory, email="catalog-admin@example.com")
    async with factory() as db:
        admin = await db.get(Customer, admin_id)
        admin.role = "admin"
        await db.commit()
    queued = await client.get("/v1/admin/supplier-offer-changes")
    assert queued.status_code == 200
    assert len(queued.json()["data"]) == 1
    change_id = queued.json()["data"][0]["id"]
    approved = await client.post(
        f"/v1/admin/supplier-offer-changes/{change_id}/decision",
        headers={"X-CSRF-Token": await csrf_token(client)},
        json={"decision": "approve", "isPrimary": True},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["data"]["current"]["retailPriceAmount"] == 870

    after = await client.get(f"/v1/products/{product_id}")
    assert after.status_code == 200
    assert after.json()["data"]["availability"] == "available"
    assert after.json()["data"]["priceAmount"] == 870
    assert "costAmount" not in after.json()["data"]


async def test_supplier_catalog_is_supplier_scoped_and_protects_reserved_stock(test_client):
    client, factory = test_client
    _, _, owned_offer_id, _ = await create_supplier_listing(client, factory)
    async with factory() as db:
        owned_offer = await db.get(SupplierOffer, owned_offer_id)
        other_supplier = Supplier(code="OTHER-CATALOG-SUPPLIER", name="Other Studio", active=True)
        db.add(other_supplier)
        await db.flush()
        other_offer = SupplierOffer(
            supplier_id=other_supplier.id,
            variant_id=owned_offer.variant_id,
            supplier_sku="OTHER-SKU-1",
            cost_amount=500,
            currency="JPY",
            minimum_order_quantity=1,
            lead_time_days=2,
            active=True,
        )
        db.add(other_offer)
        await db.flush()
        db.add(SupplierInventory(offer_id=other_offer.id, on_hand=10, reserved=0))
        owned_inventory = await db.scalar(
            select(SupplierInventory).where(
                SupplierInventory.offer_id == owned_offer_id,
            ),
        )
        owned_inventory.on_hand = 5
        owned_inventory.reserved = 2
        other_offer_id = other_offer.id
        await db.commit()

    listings = await client.get("/v1/supplier-catalog/offers")
    assert [row["offerId"] for row in listings.json()["data"]] == [str(owned_offer_id)]
    assert (await supplier_update(client, other_offer_id, {
        "productionCapacity": 10,
        "costAmount": 500,
        "minimumOrderQuantity": 1,
        "leadTimeDays": 2,
    })).status_code == 404

    conflict = await supplier_update(client, owned_offer_id, {
        "productionCapacity": 1,
        "costAmount": 700,
        "minimumOrderQuantity": 1,
        "leadTimeDays": 4,
    })
    assert conflict.status_code == 409
    async with factory() as db:
        inventory = await db.scalar(
            select(SupplierInventory).where(
                SupplierInventory.offer_id == owned_offer_id,
            ),
        )
        offer = await db.get(SupplierOffer, owned_offer_id)
        assert (inventory.on_hand, inventory.reserved, offer.cost_amount) == (5, 2, 600)

    client.cookies.clear()
    customer_id = await seed_customer_session(
        client, factory, email="plain-customer@example.com",
    )
    assert customer_id
    assert (await client.get("/v1/supplier-catalog/offers")).status_code == 403
