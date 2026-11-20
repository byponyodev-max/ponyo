"""Durable transactional notifications, retries and message safety."""

from datetime import datetime, timezone
from uuid import uuid4
from unittest.mock import MagicMock

import pytest
from sqlalchemy import select

from app.email_queue import _content, enqueue_email_notification, send_one
from app.models import EmailNotification, OutboxEvent
from test_api import test_client as test_client, safe_auth_email_and_cookies as safe_auth_email_and_cookies

@pytest.mark.asyncio
async def test_notification_is_enqueued_and_sent_once(test_client, monkeypatch):
    _, factory = test_client
    event_id = uuid4()
    async with factory() as db:
        event = OutboxEvent(id=event_id, event_type="order.payment_succeeded", payload={"orderId": "order"})
        enqueue_email_notification(
            db, event, template="order_confirmation", recipient="buyer@example.test",
            payload={"orderNumber": "PNY-1", "totalAmount": 1250, "currency": "USD",
             "items": [{"name": "<Bunny>", "quantity": 1}]},
        )
        await db.commit()
        sender = await db.scalar(select(EmailNotification).where(EmailNotification.outbox_event_id == event_id))
        assert sender.status == "pending" and sender.attempts == 0

    sent = []

    async def accept(*args, **_kwargs):
        sent.append(args)
        return True

    monkeypatch.setattr("app.email_queue.send_transactional_email", accept)
    async with factory() as db:
        assert await send_one(db) is True
        assert await send_one(db) is False
    async with factory() as db:
        sender = await db.scalar(select(EmailNotification).where(EmailNotification.outbox_event_id == event_id))
        assert sender.status == "sent" and sender.attempts == 1 and sender.sent_at is not None
    assert len(sent) == 1
    assert sent[0][0] == "buyer@example.test"
    assert sent[0][4].startswith("<") and sent[0][4].endswith("@mail.byponyo.com>")


def test_notification_content_escapes_customer_and_product_data():
    notification = EmailNotification(
        template="shipping_notification", payload={
            "orderNumber": "PNY-<1>", "carrier": "Carrier", "trackingNumber": "<script>",
            "trackingUrl": "https://track.example.test/<id>", "estimatedDeliveryAt": "tomorrow",
        },
    )
    subject, text, html = _content(notification)
    assert subject == "Your plush has left the nest."
    assert "PNY-<1>" in text and "<script>" in text
    assert "PNY-&lt;1&gt;" in html and "&lt;script&gt;" in html
    assert 'href="https://track.example.test/&lt;id&gt;"' in html
    assert "A LITTLE WORLD OF PLUSH" in html
    assert "#ed713d" in html and "Your plush has left the nest." in html


def test_product_availability_notification_is_branded_and_uses_safe_product_link():
    notification = EmailNotification(
        template="product_availability",
        payload={
            "productName": "Plush <Bunny>",
            "firstName": "Mika",
            "productUrl": "https://shop.example.test/products/bunny",
        },
    )
    subject, text, html = _content(notification)
    assert subject == "Plush <Bunny> is available now"
    assert "Hi Mika" in text and "https://shop.example.test/products/bunny" in text
    assert "Plush &lt;Bunny&gt;" in html
    assert 'href="https://shop.example.test/products/bunny"' in html
    assert "availability waitlist" in html


def test_newsletter_campaign_email_escapes_body_and_includes_unsubscribe_link():
    notification = EmailNotification(
        template="newsletter_campaign",
        payload={
            "subject": "A Ponyo update",
            "body": "Hello <script>alert(1)</script>\nNew arrivals soon.",
            "unsubscribeUrl": "https://shop.example.test/newsletter/unsubscribe?token=signed-token",
        },
    )
    subject, text, html = _content(notification)
    assert subject == "A Ponyo update"
    assert "Hello <script>alert(1)</script>\nNew arrivals soon." in text
    assert "Unsubscribe: https://shop.example.test/newsletter/unsubscribe?token=signed-token" in text
    assert "Hello &lt;script&gt;alert(1)&lt;/script&gt;<br>New arrivals soon." in html
    assert 'href="https://shop.example.test/newsletter/unsubscribe?token=signed-token"' in html
    assert "newsletter updates" in html
    assert "account or order" not in html


def test_newsletter_campaign_rejects_non_https_unsubscribe_links():
    notification = EmailNotification(
        template="newsletter_campaign",
        payload={
            "subject": "A Ponyo update",
            "body": "New arrivals soon.",
            "unsubscribeUrl": "https://example.test@attacker.test/unsubscribe",
        },
    )
    with pytest.raises(ValueError, match="Newsletter email content is invalid"):
        _content(notification)


@pytest.mark.asyncio
async def test_transactional_sender_uses_tls_and_deterministic_message_id(monkeypatch):
    from app.config import settings
    from app.email_notifications import send_transactional_email

    for name, value in {
        "environment": "test", "smtp_host": "smtp.example.test", "smtp_port": 587,
        "smtp_username": "smtp-user", "smtp_password": "smtp-password-test",
        "smtp_from_email": "noreply@example.test", "smtp_starttls": True,
        "smtp_timeout_seconds": 5,
    }.items():
        monkeypatch.setattr(settings, name, value)
    transport = MagicMock()
    monkeypatch.setattr("app.email_notifications.smtplib.SMTP", transport)

    assert await send_transactional_email(
        "buyer@example.test", "Order confirmed", "Thanks", "<p>Thanks</p>", "<stable@mail.byponyo.com>",
    ) is True
    transport.assert_called_once_with("smtp.example.test", 587, timeout=5)
    smtp = transport.return_value.__enter__.return_value
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("smtp-user", "smtp-password-test")
    message = smtp.send_message.call_args.args[0]
    assert message["To"] == "buyer@example.test"
    assert message["Message-ID"] == "<stable@mail.byponyo.com>"
    assert message.get_body(preferencelist=("plain",)).get_content().strip() == "Thanks"
    assert "<p>Thanks</p>" in message.get_body(preferencelist=("html",)).get_content()


def test_contact_request_email_is_branded_and_escapes_customer_message(monkeypatch):
    from app.config import settings
    from app.email_notifications import _send_contact_email

    for name, value in {
        "smtp_host": "smtp.example.test", "smtp_port": 587,
        "smtp_username": "smtp-user", "smtp_password": "smtp-password-test",
        "smtp_from_email": "noreply@example.test", "smtp_starttls": True,
        "smtp_timeout_seconds": 5, "support_notification_email": "ponyo@example.test",
    }.items():
        monkeypatch.setattr(settings, name, value)
    transport = MagicMock()
    monkeypatch.setattr("app.email_notifications.smtplib.SMTP", transport)

    _send_contact_email("Mika", "mika@example.com", "Plush request", "<script>alert(1)</script>")
    message = transport.return_value.__enter__.return_value.send_message.call_args.args[0]
    rendered = message.get_body(preferencelist=("html",)).get_content()
    assert message["To"] == "ponyo@example.test"
    assert message["Reply-To"] == "mika@example.com"
    assert "A customer reached out" in rendered and "PONYO" in rendered
    assert "&lt;script&gt;" in rendered and "<script>" not in rendered


@pytest.mark.asyncio
async def test_email_failure_is_retried_without_exposing_recipient_in_state(test_client, monkeypatch):
    _, factory = test_client
    async with factory() as db:
        event = OutboxEvent(event_type="order.cancelled", payload={"orderId": "order"})
        enqueue_email_notification(db, event, template="cancellation_notification", recipient="private@example.test",
                                   payload={"orderNumber": "PNY-2"})
        await db.commit()

    async def fail(*_args, **_kwargs):
        return False

    monkeypatch.setattr("app.email_queue.send_transactional_email", fail)
    async with factory() as db:
        assert await send_one(db) is True
    async with factory() as db:
        row = await db.scalar(select(EmailNotification))
        retry_at = row.next_attempt_at.replace(tzinfo=timezone.utc) if row.next_attempt_at.tzinfo is None else row.next_attempt_at
        assert row.status == "pending" and row.attempts == 1 and retry_at > datetime.now(timezone.utc)
        assert row.last_error == "DeliveryFailed"
