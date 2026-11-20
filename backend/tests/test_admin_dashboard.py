import pytest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4
from sqlalchemy import select

from app.models import Brand, Customer, EmailNotification, NewsletterSubscription, Order, OrderItem, Product, ProductInterest, ProductReservation, ProductVariant, ProductWaitlistEntry, Supplier
from app.security import hash_password, verify_password
from test_api import (
	add_product,
	csrf_token,
	safe_auth_email_and_cookies as safe_auth_email_and_cookies,
	seed_customer_session,
	test_client,
)

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


async def test_admin_can_search_and_page_newsletter_subscribers(test_client):
	client, factory = test_client
	unauthorized = await client.get("/v1/admin/newsletter/subscriptions")
	assert unauthorized.status_code == 401
	await admin_session(client, factory)
	async with factory() as db:
		db.add_all([
			NewsletterSubscription(
				email="first-friend@example.com",
				status="subscribed",
				created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
			),
			NewsletterSubscription(
				email="second-friend@example.com",
				status="subscribed",
				created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
			),
		])
		await db.commit()

	response = await client.get("/v1/admin/newsletter/subscriptions?limit=1&offset=0")
	assert response.status_code == 200
	assert response.headers["cache-control"] == "no-store"
	assert response.json()["data"]["total"] == 2
	assert response.json()["data"]["items"][0]["email"] == "second-friend@example.com"

	search = await client.get("/v1/admin/newsletter/subscriptions?q=first-friend")
	assert search.json()["data"]["total"] == 1
	assert search.json()["data"]["items"][0]["status"] == "subscribed"


async def test_admin_queues_campaign_only_for_subscribed_addresses_and_is_idempotent(test_client, monkeypatch):
	client, factory = test_client
	await admin_session(client, factory, email="newsletter-admin@example.com")
	monkeypatch.setattr(
		"app.routers.admin.get_settings",
		lambda: SimpleNamespace(contact_email_configured=True),
	)
	monkeypatch.setattr(
		"app.newsletter.get_settings",
		lambda: SimpleNamespace(
			jwt_secret="test-newsletter-secret",
			jwt_issuer="ponyo-test",
			storefront_base_url="https://shop.example.test",
		),
	)
	async with factory() as db:
		db.add_all([
			NewsletterSubscription(email="first-friend@example.com", status="subscribed"),
			NewsletterSubscription(email="second-friend@example.com", status="subscribed"),
			NewsletterSubscription(email="former-friend@example.com", status="unsubscribed"),
		])
		await db.commit()

	payload = {
		"idempotencyKey": str(uuid4()),
		"subject": "A little Ponyo update",
		"body": "Hello from Ponyo.",
	}
	first = await post(client, "/v1/admin/newsletter/campaigns", payload)
	assert first.status_code == 202
	assert first.json()["data"] == {
		"queued": 2,
		"recipientCount": 2,
		"alreadyQueued": False,
	}
	retry = await post(client, "/v1/admin/newsletter/campaigns", payload)
	assert retry.status_code == 202
	assert retry.json()["data"] == {
		"queued": 0,
		"recipientCount": 2,
		"alreadyQueued": True,
	}
	async with factory() as db:
		notifications = list((await db.scalars(select(EmailNotification))).all())
		assert {row.recipient for row in notifications} == {
			"first-friend@example.com",
			"second-friend@example.com",
		}
		assert all(row.template == "newsletter_campaign" for row in notifications)
		assert all("/newsletter/unsubscribe?token=" in row.payload["unsubscribeUrl"] for row in notifications)


async def test_newsletter_unsubscribe_and_resubscribe_invalidate_old_link(test_client, monkeypatch):
	client, factory = test_client
	from app.newsletter import unsubscribe_token

	now = datetime(2026, 1, 1, tzinfo=timezone.utc)
	monkeypatch.setattr(
		"app.newsletter.get_settings",
		lambda: SimpleNamespace(
			jwt_secret="test-newsletter-secret",
			jwt_issuer="ponyo-test",
			storefront_base_url="https://shop.example.test",
		),
	)
	monkeypatch.setattr("app.routers.content.utc_now", lambda: now + timedelta(microseconds=1))
	async with factory() as db:
		subscription = NewsletterSubscription(
			email="friend@example.com",
			status="subscribed",
			created_at=now,
		)
		db.add(subscription)
		await db.commit()
		await db.refresh(subscription)
		token = unsubscribe_token(subscription)

	unsubscribed = await client.post("/v1/newsletter/unsubscribe", json={"token": token})
	assert unsubscribed.status_code == 200
	resubscribed = await post(client, "/v1/newsletter/subscriptions", {"email": "friend@example.com"})
	assert resubscribed.status_code == 200
	stale_link = await client.post("/v1/newsletter/unsubscribe", json={"token": token})
	assert stale_link.status_code == 400
	async with factory() as db:
		subscription = await db.scalar(select(NewsletterSubscription).where(
			NewsletterSubscription.email == "friend@example.com"
		))
		assert subscription.status == "subscribed"


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
	notifications = overview.json()["data"]["notifications"]
	assert notifications["productsToReview"] == 1
	assert notifications["newSuppliers"] == 1
	assert notifications["newCustomers"] == 1

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
	assert any(row["email"] == "buyer@example.com" for row in customers.json()["data"]["items"])


async def test_admin_waitlist_is_visible_and_availability_notifications_are_idempotent(test_client, monkeypatch):
	client, factory = test_client
	await admin_session(client, factory, email="waitlist-admin@example.com")
	product_id, _variant_id = await add_product(factory, slug="admin-waitlist-plush", stock=4)
	async with factory() as db:
		db.add_all([
			ProductWaitlistEntry(product_id=product_id, email="first@example.com", first_name="First"),
			ProductWaitlistEntry(product_id=product_id, email="second@example.com", first_name="Second"),
		])
		await db.commit()
	monkeypatch.setattr(
		"app.routers.admin.get_settings",
		lambda: SimpleNamespace(
			contact_email_configured=True,
			email_inbox_accounts={},
			storefront_base_url="https://shop.example.test",
		),
	)

	waitlist = await client.get("/v1/admin/waitlist?limit=10&offset=0")
	assert waitlist.status_code == 200
	product_row = waitlist.json()["data"]["items"][0]
	assert product_row["productId"] == str(product_id)
	assert product_row["entryCount"] == product_row["waitingCount"] == 2
	assert product_row["available"] is True
	assert "email" not in product_row

	entries = await client.get(f"/v1/admin/waitlist/{product_id}")
	assert entries.status_code == 200
	assert {entry["email"] for entry in entries.json()["data"]["items"]} == {
		"first@example.com", "second@example.com",
	}
	assert all(entry["notificationStatus"] == "not_sent" for entry in entries.json()["data"]["items"])

	first_send = await client.post(
		f"/v1/admin/waitlist/{product_id}/notify",
		headers={"X-CSRF-Token": await csrf_token(client)},
		json={},
	)
	assert first_send.status_code == 202
	assert first_send.json()["data"]["queued"] == 2
	second_send = await client.post(
		f"/v1/admin/waitlist/{product_id}/notify",
		headers={"X-CSRF-Token": await csrf_token(client)},
		json={},
	)
	assert second_send.status_code == 202
	assert second_send.json()["data"]["queued"] == 0
	assert second_send.json()["data"]["alreadyQueued"] == 2

	async with factory() as db:
		notifications = list((await db.scalars(select(EmailNotification))).all())
		assert len(notifications) == 2
		assert {notification.template for notification in notifications} == {"product_availability"}
		assert {notification.notification_key for notification in notifications} == {
			f"waitlist_availability:{entry.id}"
			for entry in (await db.scalars(select(ProductWaitlistEntry))).all()
		}

	async with factory() as db:
		variant = await db.scalar(select(ProductVariant).where(ProductVariant.product_id == product_id))
		variant.stock_quantity = 0
		await db.commit()
		blocked = await client.post(
			f"/v1/admin/waitlist/{product_id}/notify",
			headers={"X-CSRF-Token": await csrf_token(client)},
			json={},
		)
	assert blocked.status_code == 409


async def test_admin_analytics_filters_period_and_keeps_currency_totals_separate(test_client):
	client, factory = test_client
	await admin_session(client, factory, email="analytics-admin@example.com")
	product_id, variant_id = await add_product(factory, slug="analytics-plush")
	now = datetime.now(timezone.utc)
	jpy_order_id = uuid4()
	async with factory() as db:
		maker = Brand(slug="analytics-maker", name="Kuma Studio", is_demo=False)
		db.add(maker)
		await db.flush()
		product = await db.get(Product, product_id)
		product.brand_id = maker.id
		db.add_all([
			Order(
				id=jpy_order_id,
				order_number="ANALYTICS-JPY",
				customer_email="buyer-jp@example.com",
				status="paid",
				payment_status="paid",
				fulfillment_status="unfulfilled",
				total_amount=10000,
				currency="JPY",
				shipping_address={"countryCode": "JP"},
				shipping_method="standard",
				payment_method="card",
				captured_amount=10000,
				refunded_amount=2000,
				created_at=now - timedelta(days=3),
			),
			Order(
				order_number="ANALYTICS-KRW",
				customer_email="buyer-kr@example.com",
				status="paid",
				payment_status="paid",
				fulfillment_status="unfulfilled",
				total_amount=15000,
				currency="KRW",
				shipping_address={"countryCode": "KR"},
				shipping_method="standard",
				payment_method="card",
				captured_amount=15000,
				created_at=now - timedelta(days=2),
			),
			Order(
				order_number="ANALYTICS-UNPAID",
				customer_email="buyer-pending@example.com",
				status="pending_payment",
				payment_status="unpaid",
				fulfillment_status="unfulfilled",
				total_amount=5000,
				currency="JPY",
				shipping_address={"countryCode": "JP"},
				shipping_method="standard",
				payment_method="card",
				created_at=now - timedelta(days=1),
			),
			Order(
				order_number="ANALYTICS-OLD",
				customer_email="buyer-old@example.com",
				status="paid",
				payment_status="paid",
				fulfillment_status="unfulfilled",
				total_amount=9000,
				currency="JPY",
				shipping_address={"countryCode": "JP"},
				shipping_method="standard",
				payment_method="card",
				captured_amount=9000,
				created_at=now - timedelta(days=60),
			),
			OrderItem(
				order_id=jpy_order_id,
				variant_id=variant_id,
				product_name="Analytics Plush",
				supplier_name="Ponyo",
				image_url="",
				quantity=2,
				unit_price=5000,
				currency="JPY",
				product_snapshot={},
			),
			Customer(
				email="analytics-customer@example.com",
				password_hash=hash_password("valid-password-123"),
				email_verified=True,
				created_at=now - timedelta(days=1),
			),
			ProductReservation(
				product_id=product_id,
				email="reserve@example.com",
				country="JP",
				created_at=now - timedelta(days=3),
			),
			ProductInterest(
				product_id=product_id,
				email="interest@example.com",
				country="KR",
				created_at=now - timedelta(days=2),
			),
		])
		await db.commit()

	response = await client.get("/v1/admin/analytics?range=7d")
	assert response.status_code == 200, response.text
	data = response.json()["data"]
	assert data["period"]["range"] == "7d"
	assert data["summary"]["orders"] == 3
	assert data["summary"]["paidOrders"] == 2
	assert data["summary"]["reservations"] == 1
	assert data["summary"]["interests"] == 1
	assert data["summary"]["newCustomers"] == 1
	assert data["summary"]["revenueByCurrency"] == [
		{"currency": "JPY", "capturedAmount": 10000, "refundedAmount": 2000, "netAmount": 8000},
		{"currency": "KRW", "capturedAmount": 15000, "refundedAmount": 0, "netAmount": 15000},
	]
	assert data["revenueSeries"]
	assert data["topProducts"] == [{
		"productId": str(product_id),
		"name": "Analytics Plush",
		"unitsSold": 2,
		"salesByCurrency": [{"currency": "JPY", "amount": 10000}],
	}]
	assert data["makerPerformance"] == [{
		"makerId": str(maker.id),
		"name": "Kuma Studio",
		"productCount": 1,
		"unitsSold": 2,
		"salesByCurrency": [{"currency": "JPY", "amount": 10000}],
	}]
	assert data["countrySales"] == [
		{
			"country": "JP",
			"orders": 2,
			"paidOrders": 1,
			"revenueByCurrency": [{
				"currency": "JPY",
				"capturedAmount": 10000,
				"refundedAmount": 2000,
				"netAmount": 8000,
			}],
		},
		{
			"country": "KR",
			"orders": 1,
			"paidOrders": 1,
			"revenueByCurrency": [{
				"currency": "KRW",
				"capturedAmount": 15000,
				"refundedAmount": 0,
				"netAmount": 15000,
			}],
		},
	]
	assert data["reservationsByCountry"] == [{"country": "JP", "count": 1}]
	assert data["interestsByCountry"] == [{"country": "KR", "count": 1}]


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
	assert (await client.get("/v1/admin/analytics")).status_code == 403
	assert (await client.get("/v1/admin/orders")).status_code == 403
	assert (await client.get("/v1/admin/products")).status_code == 403
	assert (await client.get("/v1/admin/suppliers")).status_code == 403
	assert (await client.get("/v1/admin/customers")).status_code == 403
	assert (await client.get("/v1/admin/admins")).status_code == 403
	assert (await client.post("/v1/admin/admins", json={
		"firstName": "Another", "email": "another@example.com", "password": "valid-password-123",
	}, headers={"X-CSRF-Token": await csrf_token(client)})).status_code == 403
	assert (await client.patch(
		"/v1/admin/admins/00000000-0000-4000-8000-000000000001",
		json={"firstName": "Another", "email": "another@example.com"},
		headers={"X-CSRF-Token": await csrf_token(client)},
	)).status_code == 403
	assert (await client.delete(
		"/v1/admin/admins/00000000-0000-4000-8000-000000000001",
		headers={"X-CSRF-Token": await csrf_token(client)},
	)).status_code == 403


async def test_admin_can_provision_verified_admin_accounts_without_exposing_passwords(test_client):
	client, factory = test_client
	await admin_session(client, factory, email="account-creator@example.com")
	payload = {
		"firstName": "New",
		"lastName": "Admin",
		"email": "NEW-ADMIN@example.com",
		"password": "strong-password-123!",
	}

	without_csrf = await client.post("/v1/admin/admins", json=payload)
	assert without_csrf.status_code == 403

	created = await post(client, "/v1/admin/admins", payload)
	assert created.status_code == 201
	account_data = created.json()["data"]
	assert account_data["email"] == "new-admin@example.com"
	assert account_data["emailVerified"] is True
	assert "password" not in account_data
	assert "password_hash" not in account_data

	listed = await client.get("/v1/admin/admins")
	assert listed.status_code == 200
	assert {account["email"] for account in listed.json()["data"]} == {"account-creator@example.com", "new-admin@example.com"}
	assert "password_hash" not in listed.text

	duplicate = await post(client, "/v1/admin/admins", payload)
	assert duplicate.status_code == 409
	weak_password = await post(client, "/v1/admin/admins", {**payload, "email": "weak@example.com", "password": "password-only"})
	assert weak_password.status_code == 422

	async with factory() as db:
		account = await db.scalar(select(Customer).where(Customer.email == "new-admin@example.com"))
		assert account is not None
		assert account.role == "admin"
		assert account.email_verified is True
		assert account.password_hash != payload["password"]
		assert account.password_hash


async def test_admin_can_edit_admin_profile_and_reset_password(test_client):
	client, factory = test_client
	admin_id = await admin_session(client, factory, email="editable-admin@example.com")
	async with factory() as db:
		db.add(Customer(
			email="already-used@example.com",
			password_hash=hash_password("valid-password-123"),
			email_verified=True,
		))
		await db.commit()
	payload = {
		"firstName": "Updated",
		"lastName": "Admin",
		"email": "UPDATED-ADMIN@example.com",
		"password": "updated-password-456!",
	}

	without_csrf = await client.patch(f"/v1/admin/admins/{admin_id}", json=payload)
	assert without_csrf.status_code == 403
	weak_password = await client.patch(
		f"/v1/admin/admins/{admin_id}",
		json={**payload, "password": "password-only"},
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert weak_password.status_code == 422
	duplicate = await client.patch(
		f"/v1/admin/admins/{admin_id}",
		json={**payload, "email": "already-used@example.com"},
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert duplicate.status_code == 409

	updated = await client.patch(
		f"/v1/admin/admins/{admin_id}",
		json=payload,
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert updated.status_code == 200
	assert updated.json()["data"]["email"] == "updated-admin@example.com"
	assert updated.json()["data"]["emailVerified"] is True
	assert "password" not in updated.text
	assert "password_hash" not in updated.text
	async with factory() as db:
		account = await db.get(Customer, admin_id)
		assert account is not None
		assert (account.first_name, account.last_name, account.email, account.role) == (
			"Updated", "Admin", "updated-admin@example.com", "admin",
		)
		assert account.email_verified is True
		assert account.auth_version == 1
		assert account.password_hash != payload["password"]
		assert verify_password(payload["password"], account.password_hash)


async def test_admin_revoke_preserves_account_and_cannot_revoke_self(test_client):
	client, factory = test_client
	admin_id = await admin_session(client, factory, email="active-admin@example.com")
	async with factory() as db:
		former_admin = Customer(
			email="former-admin@example.com",
			password_hash=hash_password("valid-password-123"),
			email_verified=True,
			role="admin",
		)
		db.add(former_admin)
		await db.commit()
		former_admin_id = former_admin.id

	self_revoke = await client.delete(
		f"/v1/admin/admins/{admin_id}",
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert self_revoke.status_code == 409

	revoked = await client.delete(
		f"/v1/admin/admins/{former_admin_id}",
		headers={"X-CSRF-Token": await csrf_token(client)},
	)
	assert revoked.status_code == 200
	assert revoked.json()["data"] == {"id": str(former_admin_id), "role": "customer"}
	listed = await client.get("/v1/admin/admins")
	assert [account["id"] for account in listed.json()["data"]] == [str(admin_id)]
	async with factory() as db:
		account = await db.get(Customer, former_admin_id)
		assert account is not None
		assert account.role == "customer"
		assert account.auth_version == 1
		assert account.email == "former-admin@example.com"


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
