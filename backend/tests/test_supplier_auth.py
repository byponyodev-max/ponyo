from sqlalchemy import select

import pytest

from app.models import Customer, Supplier, SupplierAccount
from app.security import hash_password
from test_api import csrf_token, test_client

pytestmark = pytest.mark.asyncio


async def supplier_account(factory, *, role="supplier", assigned=True, verified=True):
	async with factory() as db:
		supplier = Supplier(code="STUDIO-TEST", name="Studio Test", active=True)
		account = Customer(
			email="maker@example.com",
			first_name="Mina",
			last_name="Maker",
			password_hash=hash_password("supplier-password-123"),
			email_verified=verified,
			role=role,
		)
		db.add_all([supplier, account])
		await db.flush()
		if assigned:
			db.add(SupplierAccount(customer_id=account.id, supplier_id=supplier.id))
		await db.commit()
		return account.id


async def login(client, email="maker@example.com", password="supplier-password-123"):
	return await client.post(
		"/v1/supplier-auth/login",
		json={"email": email, "password": password},
		headers={"X-CSRF-Token": await csrf_token(client)},
	)


async def test_supplier_login_me_and_logout_are_scoped_to_active_supplier_accounts(test_client):
	client, factory = test_client
	await supplier_account(factory)
	response = await login(client)
	assert response.status_code == 200
	assert response.json()["data"]["supplier"]["name"] == "Studio Test"
	assert response.json()["data"]["user"]["email"] == "maker@example.com"

	me = await client.get("/v1/supplier-auth/me")
	assert me.status_code == 200
	assert me.json()["data"]["supplier"]["code"] == "STUDIO-TEST"
	assert (await client.get("/v1/supplier-orders")).status_code == 200
	assert (await client.get("/v1/auth/me")).status_code == 403

	logout = await client.post(
		"/v1/supplier-auth/logout",
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert logout.status_code == 200
	assert (await client.get("/v1/supplier-auth/me")).status_code == 401


async def test_supplier_login_supports_customer_accounts_with_a_supplier_assignment(test_client):
	client, factory = test_client
	await supplier_account(factory, role="customer")
	response = await login(client)
	assert response.status_code == 200
	assert response.json()["data"]["supplier"]["name"] == "Studio Test"
	assert (await client.get("/v1/supplier-auth/me")).status_code == 200
	assert (await client.get("/v1/auth/me")).status_code == 200
	assert (await login(client, password="incorrect-password")).status_code == 401

	client.cookies.clear()
	async with factory() as db:
		unassigned_supplier = Supplier(code="STUDIO-UNASSIGNED", name="Unassigned", active=True)
		unassigned = Customer(
			email="unassigned@example.com", first_name="Una", last_name="Signed",
			password_hash=hash_password("supplier-password-123"), email_verified=True, role="supplier",
		)
		unverified_supplier = Supplier(code="STUDIO-PENDING", name="Pending", active=True)
		unverified = Customer(
			email="pending@example.com", first_name="Penny", last_name="Pending",
			password_hash=hash_password("supplier-password-123"), email_verified=False, role="supplier",
		)
		db.add_all([unassigned_supplier, unassigned, unverified_supplier, unverified])
		await db.flush()
		db.add(SupplierAccount(customer_id=unverified.id, supplier_id=unverified_supplier.id))
		await db.commit()

	assert (await login(client, email="unassigned@example.com")).status_code == 403
	assert (await login(client, email="pending@example.com")).status_code == 403


async def test_supplier_identity_rejects_inactive_supplier_assignment(test_client):
	client, factory = test_client
	await supplier_account(factory)
	async with factory() as db:
		supplier = await db.scalar(select(Supplier).where(Supplier.code == "STUDIO-TEST"))
		supplier.active = False
		await db.commit()
	assert (await login(client)).status_code == 403