from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.config import settings
from app.email_notifications import _send_transactional_email
from app.email_queue import send_one
from app.mailbox_sync import _parse_remote_message
from app.models import ContactRequest, EmailInboxMessage, EmailNotification
from test_admin_dashboard import admin_session
from test_api import (
    csrf_token,
    safe_auth_email_and_cookies as safe_auth_email_and_cookies,
    test_client as test_client,
)


@pytest.mark.asyncio
async def test_contact_message_is_read_and_reply_uses_queued_email_transport(
    test_client, safe_auth_email_and_cookies, monkeypatch,
):
    client, factory = test_client
    await admin_session(client, factory, email="email-admin@example.com")
    async with factory() as db:
        contact = ContactRequest(
            name="Mika", email="mika@example.com", request_type="Customer support",
            message="Can you help me?", status="received",
        )
        db.add(contact)
        await db.commit()
        contact_id = contact.id

    inbox = await client.get("/v1/admin/email/inbox")
    assert inbox.status_code == 200
    thread = next(row for row in inbox.json()["data"]["items"] if row["threadKey"] == f"contact:{contact_id}")
    detail = await client.get(f"/v1/admin/email/inbox/{thread['threadKey']}")
    assert detail.status_code == 200
    assert detail.json()["data"]["messages"][0]["body"] == "Can you help me?"

    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_username", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    monkeypatch.setattr(settings, "smtp_from_email", "hello@example.com")
    idempotency_key = str(uuid4())
    reply = await client.post(
        f"/v1/admin/email/inbox/{thread['threadKey']}/reply",
        json={"idempotencyKey": idempotency_key, "body": "Thanks for your note."},
        headers={"X-CSRF-Token": await csrf_token(client)},
    )
    assert reply.status_code == 200, reply.text
    assert reply.json()["data"]["deliveryStatus"] == "queued"
    duplicate = await client.post(
        f"/v1/admin/email/inbox/{thread['threadKey']}/reply",
        json={"idempotencyKey": idempotency_key, "body": "Thanks for your note."},
        headers={"X-CSRF-Token": await csrf_token(client)},
    )
    assert duplicate.status_code == 200
    assert duplicate.json()["data"]["alreadyQueued"] is True

    async with factory() as db:
        contact = await db.get(ContactRequest, contact_id)
        queued = await db.scalar(select(EmailNotification).where(EmailNotification.template == "admin_email_reply"))
        assert contact.status == "received"
        assert queued.status == "pending"

    delivered = []

    async def accept(*args, **kwargs):
        delivered.append((args, kwargs))
        return True

    monkeypatch.setattr("app.email_queue.send_transactional_email", accept)
    async with factory() as db:
        assert await send_one(db) is True
    async with factory() as db:
        outgoing = await db.scalar(select(EmailInboxMessage).where(
            EmailInboxMessage.source_type == "admin_reply",
            EmailInboxMessage.source_key == idempotency_key,
        ))
        assert outgoing.delivery_status == "sent"
        contact = await db.get(ContactRequest, contact_id)
        assert contact.status == "replied"
    assert delivered[0][0][0] == "mika@example.com"
    assert delivered[0][1] == {"in_reply_to": None, "references": None}


def test_imap_message_parser_extracts_plain_body_and_thread_headers():
    raw = (
        b"From: Mika Example <mika@example.com>\r\n"
        b"To: hello@example.com\r\n"
        b"Subject: Help with my order\r\n"
        b"Message-ID: <incoming@example.com>\r\n"
        b"In-Reply-To: <previous@example.com>\r\n"
        b"References: <root@example.com> <previous@example.com>\r\n"
        b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
        b"Could you help me?\r\n"
    )
    parsed = _parse_remote_message(7, raw)
    assert parsed is not None
    assert parsed["from_email"] == "mika@example.com"
    assert parsed["subject"] == "Help with my order"
    assert parsed["text_body"] == "Could you help me?"
    assert parsed["references"] == ["<previous@example.com>", "<root@example.com>"]


def test_transactional_reply_sets_threading_headers(monkeypatch):
    for name, value in {
        "smtp_host": "smtp.example.test",
        "smtp_username": None,
        "smtp_password": None,
        "smtp_from_email": "hello@example.com",
        "smtp_starttls": True,
    }.items():
        monkeypatch.setattr(settings, name, value)
    transport = MagicMock()
    monkeypatch.setattr("app.email_notifications.smtplib.SMTP", transport)

    _send_transactional_email(
        "mika@example.com", "Re: Hello", "Reply", "<p>Reply</p>", "<reply@mail.byponyo.com>",
        in_reply_to="<incoming@example.com>",
        references="<root@example.com> <incoming@example.com>",
    )
    message = transport.return_value.__enter__.return_value.send_message.call_args.args[0]
    assert message["In-Reply-To"] == "<incoming@example.com>"
    assert message["References"] == "<root@example.com> <incoming@example.com>"
