import pytest
from sqlalchemy import select

from app.models import Customer, Product, Supplier
from app.security import hash_password
from test_api import add_product, csrf_token, seed_customer_session, test_client

pytestmark = pytest.mark.asyncio


async def admin_session(client, factory, *, role="admin", email="ops@example.com"):
	customer_id = await seed_customer_session(client, factory, email=email)
	async with factory() as db:
		account = await db.get(Customer, customer_id)
		account.role = role
		await db.commit()
	return customer_id


async def post(client, path, body):
	return await client.post(path, json=body, headers={"X-CSRF-Token": await csrf_token(client)})


async def test_admin_dashboard_orders_products_customers_and_supplier_controls(test_client, monkeypatch):
	client, factory = test_client
	monkeypatch.setattr("app.translations._translate_with_libretranslate", lambda text, language: f"{language}:{text}")
	await admin_session(client, factory)
	product_id, _variant_id = await add_product(factory, slug="admin-review-plush", stock=4)
	async with factory() as db:
		product = await db.get(Product, product_id)
		product.published = False
		supplier = Supplier(code="ADMIN-DASHBOARD", name="Admin Dashboard Studio", active=True)
		customer = Customer(email="buyer@example.com", first_name="Test", last_name="Buyer", password_hash=hash_password("valid-password-123"), email_verified=True)
		db.add_all([supplier, customer])
		await db.commit()
		supplier_id = supplier.id

	overview = await client.get("/v1/admin/dashboard")
	assert overview.status_code == 200
	assert overview.json()["data"]["metrics"]["unpublishedProducts"] == 1
	assert overview.json()["data"]["metrics"]["activeSuppliers"] == 1

	orders = await client.get("/v1/admin/orders?q=buyer@example.com")
	assert orders.status_code == 200
	assert "items" in orders.json()["data"]
	products = await client.get("/v1/admin/products?published=false")
	assert products.status_code == 200
	assert [row["id"] for row in products.json()["data"]["items"]] == [str(product_id)]

	publication = await client.patch(
		f"/v1/admin/products/{product_id}/publication",
		json={"published": True},
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert publication.status_code == 200
	assert publication.json()["data"]["published"] is True

	suppliers = await client.get("/v1/admin/suppliers")
	assert suppliers.status_code == 200
	assert any(row["id"] == str(supplier_id) for row in suppliers.json()["data"])
	status = await client.patch(
		f"/v1/admin/suppliers/{supplier_id}/status",
		json={"active": False},
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert status.status_code == 200
	assert status.json()["data"]["active"] is False

	customers = await client.get("/v1/admin/customers?q=buyer@example.com")
	assert customers.status_code == 200
	assert any(row["email"] == "buyer@example.com" for row in customers.json()["data"])


async def test_admin_cannot_publish_product_without_required_translations(test_client, monkeypatch):
	client, factory = test_client
	await admin_session(client, factory)
	product_id, _variant_id = await add_product(factory, slug="untranslated-plush", stock=4)
	async with factory() as db:
		product = await db.get(Product, product_id)
		product.published = False
		await db.commit()
	monkeypatch.setattr("app.config.settings.translation_provider", "disabled")

	publication = await client.patch(
		f"/v1/admin/products/{product_id}/publication",
		json={"published": True},
		headers={"X-CSRF-Token": await csrf_token(client)},
	)

	assert publication.status_code == 503
	async with factory() as db:
		product = await db.get(Product, product_id)
		assert product.published is False


async def test_admin_reads_and_writes_reject_non_admins(test_client):
	client, factory = test_client
	await admin_session(client, factory, role="customer", email="not-admin@example.com")
	assert (await client.get("/v1/admin/dashboard")).status_code == 403
	assert (await client.get("/v1/admin/orders")).status_code == 403
	assert (await client.get("/v1/admin/products")).status_code == 403
	assert (await client.get("/v1/admin/suppliers")).status_code == 403
	assert (await client.get("/v1/admin/customers")).status_code == 403


async def test_admin_auth_is_separate_and_requires_admin_role_and_csrf(test_client):
	client, factory = test_client
	await admin_session(client, factory, role="admin", email="admin-login@example.com")
	login = await post(client, "/v1/admin-auth/login", {
		"email": "admin-login@example.com",
		"password": "valid-password-123",
	})
	assert login.status_code == 200
	assert login.json()["data"]["user"]["role"] == "admin"
	assert (await client.get("/v1/admin-auth/me")).status_code == 200

	logout_without_csrf = await client.post("/v1/admin-auth/logout")
	assert logout_without_csrf.status_code == 403
	logout = await post(client, "/v1/admin-auth/logout", {})
	assert logout.status_code == 200
	assert (await client.get("/v1/admin-auth/me")).status_code == 401

	await admin_session(client, factory, role="customer", email="customer-login@example.com")
	denied = await post(client, "/v1/admin-auth/login", {
		"email": "customer-login@example.com",
		"password": "valid-password-123",
	})
	assert denied.status_code == 403
