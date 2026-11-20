from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.config import EmailInboxMailboxSettings, settings
from app.email_notifications import _send_transactional_email
from app.email_queue import send_one
from app.mailbox_sync import FetchedMessage, MailboxSyncError, _parse_remote_message, _plain_email_body, sync_mailbox_once
from app.models import ContactRequest, EmailInboxMessage, EmailInboxSyncState, EmailNotification
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
    monkeypatch.setattr(settings, "email_inbox_mailboxes", {
        "SUPPORT": EmailInboxMailboxSettings(
            address="support@byponyo.com",
            username="support@byponyo.com",
            password="local-test-password",
            imap_host="imap.example.test",
            smtp_host="smtp.example.test",
            from_email="support@byponyo.com",
        ),
    })
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
        assert outgoing.from_email == "support@byponyo.com"
        contact = await db.get(ContactRequest, contact_id)
        assert contact.status == "replied"
    assert delivered[0][0][0] == "mika@example.com"
    assert delivered[0][1] == {
        "in_reply_to": None,
        "references": None,
        "mailbox_key": "SUPPORT",
    }


@pytest.mark.asyncio
async def test_inbox_filters_by_mailbox_and_reply_delivery_state(test_client, monkeypatch):
    client, factory = test_client
    await admin_session(client, factory, email="inbox-filter-admin@example.com")
    addresses = {
        "HELLO": "hello@byponyo.com",
        "SUPPORT": "support@byponyo.com",
        "PARTNERS": "partners@byponyo.com",
    }
    monkeypatch.setattr(settings, "email_inbox_mailboxes", {
        key: EmailInboxMailboxSettings(
            address=address,
            username=address,
            password="local-test-password",
            imap_host="imap.example.test",
            smtp_host="smtp.example.test",
            from_email=address,
        )
        for key, address in addresses.items()
    })
    now = datetime.now(timezone.utc)
    async with factory() as db:
        db.add_all([
            EmailInboxMessage(
                thread_key="support-failed",
                source_type="imap",
                source_key="support-failed-inbound",
                direction="inbound",
                from_email="customer@example.com",
                to_email=addresses["SUPPORT"],
                subject="Delivery issue",
                text_body="Could you help?",
                mailbox_name="SUPPORT",
                is_read=False,
                received_at=now - timedelta(minutes=3),
            ),
            EmailInboxMessage(
                thread_key="support-failed",
                source_type="admin_reply",
                source_key="support-failed-reply",
                direction="outbound",
                from_email=addresses["SUPPORT"],
                to_email="customer@example.com",
                subject="Re: Delivery issue",
                text_body="We are checking.",
                mailbox_name="SUPPORT",
                delivery_status="failed",
                received_at=now - timedelta(minutes=1),
            ),
            EmailInboxMessage(
                thread_key="support-unreplied",
                source_type="imap",
                source_key="support-unreplied-inbound",
                direction="inbound",
                from_email="another@example.com",
                to_email=addresses["SUPPORT"],
                subject="Product question",
                text_body="Is it available?",
                mailbox_name="SUPPORT",
                is_read=True,
                received_at=now - timedelta(minutes=2),
            ),
            EmailInboxMessage(
                thread_key="support-follow-up",
                source_type="admin_reply",
                source_key="support-follow-up-old-reply",
                direction="outbound",
                from_email=addresses["SUPPORT"],
                to_email="customer-follow-up@example.com",
                subject="Re: Earlier question",
                text_body="The first response.",
                mailbox_name="SUPPORT",
                delivery_status="sent",
                received_at=now - timedelta(minutes=2),
            ),
            EmailInboxMessage(
                thread_key="support-follow-up",
                source_type="imap",
                source_key="support-follow-up-new-inbound",
                direction="inbound",
                from_email="customer-follow-up@example.com",
                to_email=addresses["SUPPORT"],
                subject="Re: Earlier question",
                text_body="I have one more question.",
                mailbox_name="SUPPORT",
                is_read=True,
                received_at=now - timedelta(minutes=1),
            ),
            EmailInboxMessage(
                thread_key="hello-replied",
                source_type="imap",
                source_key="hello-replied-inbound",
                direction="inbound",
                from_email="third@example.com",
                to_email=addresses["HELLO"],
                subject="Hello",
                text_body="Hello Ponyo",
                mailbox_name="HELLO",
                is_read=True,
                received_at=now - timedelta(minutes=2),
            ),
            EmailInboxMessage(
                thread_key="hello-replied",
                source_type="admin_reply",
                source_key="hello-replied-outbound",
                direction="outbound",
                from_email=addresses["HELLO"],
                to_email="third@example.com",
                subject="Re: Hello",
                text_body="Hello!",
                mailbox_name="HELLO",
                delivery_status="sent",
                received_at=now - timedelta(minutes=1),
            ),
        ])
        await db.commit()

    unread = await client.get("/v1/admin/email/inbox?mailboxKey=SUPPORT&status=unread")
    assert unread.status_code == 200
    unread_data = unread.json()["data"]
    assert [row["threadKey"] for row in unread_data["items"]] == ["support-failed"]
    assert unread_data["items"][0]["replyStatus"] == "failed"
    assert unread_data["summary"]["byMailbox"]["SUPPORT"] == {
        "total": 3, "unread": 1, "needsReply": 3, "replied": 0, "pending": 0, "failed": 1, "archived": 0, "archived": 0,
    }

    needs_reply = await client.get("/v1/admin/email/inbox?mailboxKey=SUPPORT&status=needs_reply")
    assert {row["threadKey"] for row in needs_reply.json()["data"]["items"]} == {
        "support-failed", "support-unreplied", "support-follow-up",
    }
    replied = await client.get("/v1/admin/email/inbox?mailboxKey=HELLO&status=replied")
    assert [row["threadKey"] for row in replied.json()["data"]["items"]] == ["hello-replied"]


@pytest.mark.asyncio
async def test_admin_can_archive_and_restore_email_thread_without_deleting_messages(test_client):
    client, factory = test_client
    await admin_session(client, factory, email="email-archive-admin@example.com")
    async with factory() as db:
        db.add(EmailInboxMessage(
            thread_key="archive-test-thread",
            source_type="imap",
            source_key="archive-test-message",
            direction="inbound",
            from_email="customer@example.test",
            to_email="hello@byponyo.com",
            subject="An old question",
            text_body="A question to archive.",
            mailbox_name="HELLO",
            is_read=False,
        ))
        await db.commit()

    csrf = await csrf_token(client)
    archived = await client.patch(
        "/v1/admin/email/inbox/archive-test-thread/archive",
        json={"archived": True},
        headers={"X-CSRF-Token": csrf},
    )
    assert archived.status_code == 200
    assert archived.json()["data"]["isArchived"] is True

    active = await client.get("/v1/admin/email/inbox?status=all")
    assert "archive-test-thread" not in {
        row["threadKey"] for row in active.json()["data"]["items"]
    }
    assert active.json()["data"]["summary"]["archived"] == 1

    archived_list = await client.get("/v1/admin/email/inbox?status=archived")
    archived_thread = next(
        row for row in archived_list.json()["data"]["items"]
        if row["threadKey"] == "archive-test-thread"
    )
    assert archived_thread["isArchived"] is True
    details = await client.get("/v1/admin/email/inbox/archive-test-thread")
    assert details.json()["data"]["isArchived"] is True
    assert len(details.json()["data"]["messages"]) == 1

    restored = await client.patch(
        "/v1/admin/email/inbox/archive-test-thread/archive",
        json={"archived": False},
        headers={"X-CSRF-Token": csrf},
    )
    assert restored.status_code == 200
    restored_list = await client.get("/v1/admin/email/inbox?status=all")
    restored_thread = next(
        row for row in restored_list.json()["data"]["items"]
        if row["threadKey"] == "archive-test-thread"
    )
    assert restored_thread["isArchived"] is False
    async with factory() as db:
        stored_message = await db.scalar(select(EmailInboxMessage).where(
            EmailInboxMessage.thread_key == "archive-test-thread",
        ))
        assert stored_message.archived_at is None


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


def test_imap_message_parser_converts_html_to_readable_text_and_ignores_scripts():
    raw = (
        b"From: Mika Example <mika@example.com>\r\n"
        b"To: hello@example.com\r\n"
        b"Subject: HTML message\r\n"
        b"Content-Type: text/html; charset=utf-8\r\n\r\n"
        b"<html><head><style>.hidden{display:none}</style><title>Ignored</title></head>"
        b"<body><p>Hello &amp; welcome</p><p>Please check <strong>your order</strong>.</p>"
        b"<ul><li>First item</li><li>Second item</li></ul><script>alert('ignored')</script></body></html>"
    )

    parsed = _parse_remote_message(8, raw)

    assert parsed is not None
    assert "Hello & welcome" in parsed["text_body"]
    assert "Please check your order." in parsed["text_body"]
    assert "- First item" in parsed["text_body"]
    assert "- Second item" in parsed["text_body"]
    assert "<p>" not in parsed["text_body"]
    assert "display:none" not in parsed["text_body"]
    assert "alert(" not in parsed["text_body"]


def test_email_body_removes_invisible_tracking_and_decoding_characters():
    body = "Welcome!\ufeff \u034f\u200b\u2060 2004\ufffd\ufffd2026"

    assert _plain_email_body(body) == "Welcome! 20042026"


@pytest.mark.asyncio
async def test_existing_html_inbox_message_is_normalized_before_thread_response(test_client):
    client, factory = test_client
    await admin_session(client, factory, email="html-inbox-admin@example.com")
    async with factory() as db:
        db.add(EmailInboxMessage(
            thread_key="old-html-message",
            source_type="contact_form",
            source_key="old-html-source",
            direction="inbound",
            from_email="mika@example.com",
            to_email="hello@byponyo.com",
            subject="Old HTML message",
            text_body="<html><body><p>Hello &amp; welcome</p><script>ignored()</script></body></html>",
            mailbox_name="HELLO",
            uid_validity="1",
            uid=500,
        ))
        db.add(EmailInboxMessage(
            thread_key="old-html-message",
            source_type="imap",
            source_key="old-html-reply",
            direction="outbound",
            from_email="hello@byponyo.com",
            to_email="mika@example.com",
            subject="Re: Old HTML message",
            text_body="<html><body><p>We are checking.</p></body></html>",
            mailbox_name="HELLO",
        ))
        db.add(EmailInboxMessage(
            thread_key="old-html-message",
            source_type="imap",
            source_key="old-html-filler",
            direction="inbound",
            from_email="mika@example.com",
            to_email="hello@byponyo.com",
            subject="Re: Old HTML message",
            text_body="Welcome!\ufeff \u034f\u200b\u2060 2004\ufffd\ufffd2026",
            mailbox_name="HELLO",
            uid_validity="1",
            uid=501,
        ))
        await db.commit()

    response = await client.get("/v1/admin/email/inbox/old-html-message")

    assert response.status_code == 200
    assert {message["body"] for message in response.json()["data"]["messages"]} == {
        "Hello & welcome",
        "We are checking.",
        "Welcome! 20042026",
    }
    async with factory() as db:
        messages = (await db.scalars(select(EmailInboxMessage).where(
            EmailInboxMessage.source_key.in_(["old-html-source", "old-html-reply", "old-html-filler"]),
        ))).all()
        assert {message.text_body for message in messages} == {
            "Hello & welcome",
            "We are checking.",
            "Welcome! 20042026",
        }


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


@pytest.mark.asyncio
async def test_imap_sync_persists_each_mailbox_and_advances_uid_cursors(test_client, monkeypatch):
    _, factory = test_client
    addresses = {
        "HELLO": "hello@byponyo.com",
        "SUPPORT": "support@byponyo.com",
        "PARTNERS": "partners@byponyo.com",
    }
    monkeypatch.setattr(settings, "email_inbox_mailboxes", {
        key: EmailInboxMailboxSettings(
            address=address,
            username=address,
            password="local-test-password",
            imap_host="imap.example.test",
            smtp_host="smtp.example.test",
            from_email=address,
        )
        for key, address in addresses.items()
    })
    monkeypatch.setattr(settings, "email_inbox_imap_host", None)
    raw = (
        b"From: Mika Example <mika@example.com>\r\n"
        b"To: hello@example.com\r\n"
        b"Subject: Inbox message\r\n"
        b"Message-ID: <inbox-1@example.com>\r\n"
        b"Content-Type: text/plain; charset=utf-8\r\n\r\n"
        b"A first message.\r\n"
    )
    fetched = []

    def fetch(mailbox, cursor, old_validity):
        fetched.append(mailbox.username)
        return "42", 9, [FetchedMessage(uid=9, raw=raw)]

    monkeypatch.setattr("app.mailbox_sync._fetch_messages_sync", fetch)

    async with factory() as db:
        first = await sync_mailbox_once(db)
    async with factory() as db:
        second = await sync_mailbox_once(db)
        messages = (await db.scalars(select(EmailInboxMessage).where(
            EmailInboxMessage.source_type == "imap"
        ))).all()
    assert first["imported"] == 3
    assert second["imported"] == 0
    assert len(messages) == 3
    assert {message.mailbox_name for message in messages} == set(addresses)
    assert all(message.uid_validity == "42" and message.uid == 9 for message in messages)
    assert set(fetched) == set(addresses.values())


@pytest.mark.asyncio
async def test_imap_sync_persists_safe_error_detail_for_failed_mailbox(test_client, monkeypatch):
    _, factory = test_client
    address = "hello@byponyo.com"
    monkeypatch.setattr(settings, "email_inbox_mailboxes", {
        "HELLO": EmailInboxMailboxSettings(
            address=address,
            username=address,
            password="test-password",
            imap_host="imap.example.test",
        ),
    })
    monkeypatch.setattr(settings, "email_inbox_imap_host", None)
    diagnostic = "IMAP login rejected; check the mailbox username and app password."

    def fail_sync(mailbox, cursor, old_validity):
        raise MailboxSyncError(diagnostic)

    monkeypatch.setattr("app.mailbox_sync._fetch_messages_sync", fail_sync)

    async with factory() as db:
        result = await sync_mailbox_once(db)
    async with factory() as db:
        state = await db.scalar(select(EmailInboxSyncState))

    assert result["mailboxes"][0]["error"] == diagnostic
    assert state.last_error == diagnostic
