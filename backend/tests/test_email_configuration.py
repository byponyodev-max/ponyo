"""Backend email configuration must not depend on the server launch directory."""

import logging
import os
import smtplib
import ssl
from unittest.mock import AsyncMock

import pytest

from app.config import BACKEND_ENV_FILES, Settings, settings
from app.email_notifications import contact_notification_recipient, _smtp_ssl_context, send_contact_notification


@pytest.fixture
def isolated_email_settings(monkeypatch, tmp_path):
    for key in tuple(os.environ):
        if key.lower() in Settings.model_fields or key.lower().startswith("email_inbox_mailboxes__"):
            monkeypatch.delenv(key)
    backend = tmp_path / "backend"
    backend.mkdir()
    paths = (backend / ".env", backend / ".env.local")
    monkeypatch.setitem(Settings.model_config, "env_file", paths)
    return tmp_path, paths


@pytest.mark.parametrize("launch_directory", [".", "backend", "elsewhere"])
def test_backend_email_files_are_loaded_independent_of_cwd(isolated_email_settings, monkeypatch, launch_directory):
    root, (_, local) = isolated_email_settings
    local.write_text(
        "SMTP_HOST=smtp.example.test\nSMTP_USERNAME=test-user\n"
        "SMTP_PASSWORD=test-password\nCONTACT_NOTIFICATION_EMAIL=owner@example.test\n",
        encoding="utf-8",
    )
    # Frontend credentials are deliberately unrelated and must never be selected.
    (root / ".env.local").write_text("SMTP_HOST=wrong.example.test\n", encoding="utf-8")
    cwd = root / launch_directory
    cwd.mkdir(exist_ok=True)
    monkeypatch.chdir(cwd)
    configured = Settings()
    assert configured.contact_email_configured is True
    assert configured.smtp_host == "smtp.example.test"
    assert configured.contact_notification_email == "owner@example.test"


def test_default_env_paths_are_absolute_backend_files():
    assert all(path.is_absolute() for path in BACKEND_ENV_FILES)
    assert [path.name for path in BACKEND_ENV_FILES] == [".env", ".env.local"]
    assert all(path.parent.name == "backend" for path in BACKEND_ENV_FILES)


@pytest.mark.parametrize(("request_type", "recipient_field"), [
    ("General inquiry", "contact_notification_email"),
    ("Order question", "support_notification_email"),
    ("Delivery question", "support_notification_email"),
    ("Plush request", "support_notification_email"),
    ("Supplier partnership", "partners_notification_email"),
    ("Maker application", "partners_notification_email"),
])
def test_contact_notifications_route_to_the_matching_team_inbox(monkeypatch, request_type, recipient_field):
    recipients = {
        "contact_notification_email": "hello@example.test",
        "support_notification_email": "support@example.test",
        "partners_notification_email": "partners@example.test",
    }
    for name, value in recipients.items():
        monkeypatch.setattr(settings, name, value)
    assert contact_notification_recipient(request_type) == recipients[recipient_field]


def test_local_file_then_process_then_explicit_values_take_precedence(isolated_email_settings, monkeypatch):
    _, (base, local) = isolated_email_settings
    base.write_text("SMTP_HOST=base.example.test\n", encoding="utf-8")
    local.write_text("SMTP_HOST=local.example.test\n", encoding="utf-8")
    assert Settings().smtp_host == "local.example.test"
    monkeypatch.setenv("SMTP_HOST", "process.example.test")
    assert Settings().smtp_host == "process.example.test"
    assert Settings(smtp_host="explicit.example.test").smtp_host == "explicit.example.test"


def test_explicit_env_file_opt_out_still_works(isolated_email_settings):
    _, (_, local) = isolated_email_settings
    local.write_text("SMTP_HOST=smtp.example.test\n", encoding="utf-8")
    assert Settings(_env_file=None).smtp_host is None


def test_per_mailbox_email_settings_load_nested_env_without_exposing_password(isolated_email_settings):
    _, (_, local) = isolated_email_settings
    local.write_text(
        "EMAIL_INBOX_MAILBOXES__HELLO__ADDRESS=hello@example.test\n"
        "EMAIL_INBOX_MAILBOXES__HELLO__USERNAME=hello@example.test\n"
        "EMAIL_INBOX_MAILBOXES__HELLO__PASSWORD=mailbox-secret-test\n"
        "EMAIL_INBOX_MAILBOXES__HELLO__IMAP_HOST=imap.example.test\n"
        "EMAIL_INBOX_MAILBOXES__HELLO__SMTP_HOST=smtp.example.test\n"
        "EMAIL_INBOX_MAILBOXES__HELLO__FROM_EMAIL=hello@example.test\n",
        encoding="utf-8",
    )
    configured = Settings()
    mailbox = configured.email_inbox_accounts["hello"]
    assert mailbox.imap_configured is True
    assert mailbox.smtp_configured is True
    assert mailbox.password.get_secret_value() == "mailbox-secret-test"
    assert "mailbox-secret-test" not in repr(configured)


def test_smtp_context_keeps_chain_and_hostname_verification(monkeypatch):
    strict_flag = getattr(ssl, "VERIFY_X509_STRICT", 0)
    monkeypatch.setattr(settings, "smtp_x509_strict", False)
    context = _smtp_ssl_context()
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True
    assert not context.verify_flags & strict_flag

    monkeypatch.setattr(settings, "smtp_x509_strict", True)
    strict_context = _smtp_ssl_context()
    assert strict_context.verify_mode == ssl.CERT_REQUIRED
    assert strict_context.check_hostname is True
    if strict_flag:
        assert strict_context.verify_flags & strict_flag


@pytest.mark.asyncio
async def test_unconfigured_contact_transport_is_visible_without_customer_data(monkeypatch, caplog):
    monkeypatch.setattr(settings, "smtp_host", None)
    worker = AsyncMock()
    monkeypatch.setattr("app.email_notifications.asyncio.to_thread", worker)
    with caplog.at_level(logging.WARNING, logger="app.email_notifications"):
        assert await send_contact_notification("Private name", "private@example.test", "Private topic", "Private body") is False
    worker.assert_not_awaited()
    assert "reason=transport_not_configured" in caplog.text
    assert "Private" not in caplog.text and "private@example.test" not in caplog.text


@pytest.mark.asyncio
async def test_contact_smtp_failure_logs_only_type_and_numeric_code(monkeypatch, caplog):
    for name, value in {
        "smtp_host": "smtp.example.test", "smtp_from_email": "sender@example.test",
        "smtp_username": "test-user", "smtp_password": "test-password",
    }.items():
        monkeypatch.setattr(settings, name, value)
    worker = AsyncMock(side_effect=smtplib.SMTPAuthenticationError(535, b"private@example.test secret-password"))
    monkeypatch.setattr("app.email_notifications.asyncio.to_thread", worker)
    with caplog.at_level(logging.WARNING, logger="app.email_notifications"):
        assert await send_contact_notification("Private name", "private@example.test", "Private topic", "Private body") is False
    assert "exception_type=SMTPAuthenticationError smtp_status_code=535" in caplog.text
    assert "private@example.test" not in caplog.text and "secret-password" not in caplog.text


@pytest.mark.asyncio
async def test_contact_notification_returns_true_after_transport_acceptance(monkeypatch):
    for name, value in {
        "smtp_host": "smtp.example.test", "smtp_from_email": "sender@example.test",
        "smtp_username": None,
    }.items():
        monkeypatch.setattr(settings, name, value)
    worker = AsyncMock(return_value=None)
    monkeypatch.setattr("app.email_notifications.asyncio.to_thread", worker)
    assert await send_contact_notification("Test", "customer@example.test", "Test topic", "Test body") is True
    worker.assert_awaited_once()