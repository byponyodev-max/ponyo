"""IMAP ingestion and storefront-message import for the admin inbox."""

import asyncio
import hashlib
import imaplib
import logging
import re
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime
from html.parser import HTMLParser
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import EmailInboxMailboxSettings, get_settings
from app.db import SessionLocal
from app.email_notifications import contact_notification_recipient
from app.models import ContactRequest, EmailInboxMessage, EmailInboxSyncState, MakerApplication, utc_now
from app.ssl_context import create_proxy_compatible_ssl_context

logger = logging.getLogger("ponyo.mailbox")
MAX_MESSAGE_BYTES = 100_000
MAX_MESSAGE_TEXT = 50_000
MESSAGE_ID_PATTERN = re.compile(r"<[^<>\s]+>")
HTML_MARKUP_PATTERN = re.compile(r"</?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?\s*/?>")
HTML_BLOCK_TAGS = {
    "address", "article", "blockquote", "br", "dd", "div", "dl", "dt", "fieldset", "figcaption",
    "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li",
    "main", "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
}
HTML_SKIP_TAGS = {"head", "noscript", "script", "style", "title"}
INVISIBLE_EMAIL_CHARS = ("\u00ad", "\u034f", "\u200b", "\u2060", "\ufeff", "\ufffd")


class MailboxSyncError(RuntimeError):
    pass


def mailbox_sync_state_key(account_key: str, mailbox: EmailInboxMailboxSettings) -> str:
    identity = f"{mailbox.username}:{mailbox.imap_mailbox}"
    digest = hashlib.sha256(identity.encode()).hexdigest()[:32]
    return f"{account_key}:{digest}"


class _TextFromHtml(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in HTML_SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag == "li":
            self.parts.append("- ")
        elif tag in {"br", "ol", "ul"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in HTML_SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
            return
        if not self.skip_depth and tag in HTML_BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if data.strip() and not self.skip_depth:
            self.parts.append(data)


@dataclass(frozen=True)
class FetchedMessage:
    uid: int
    raw: bytes


async def _insert_if_new(db: AsyncSession, values: dict) -> bool:
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        statement = pg_insert(EmailInboxMessage).values(**values).on_conflict_do_nothing()
    elif dialect == "sqlite":
        statement = sqlite_insert(EmailInboxMessage).values(**values).on_conflict_do_nothing()
    else:
        raise RuntimeError(f"Email inbox persistence is not supported on {dialect}.")
    result = await db.execute(statement)
    return result.rowcount == 1


def _clean_email_text(value: str) -> str:
    text = "".join(char for char in value if char not in INVISIBLE_EMAIL_CHARS)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def _html_to_text(value: str) -> str:
    parser = _TextFromHtml()
    parser.feed(value)
    parser.close()
    return _clean_email_text("".join(parser.parts))


def _plain_email_body(value: str) -> str:
    body = _html_to_text(value) if HTML_MARKUP_PATTERN.search(value) else _clean_email_text(value)
    return body[:MAX_MESSAGE_TEXT]


def _message_body(message) -> str:
    plain_text = ""
    html_text = ""
    for part in message.walk():
        if part.get_content_maintype() != "text" or part.get_content_disposition() == "attachment":
            continue
        try:
            content = part.get_content()
        except (LookupError, UnicodeError):
            payload = part.get_payload(decode=True) or b""
            content = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        if not isinstance(content, str):
            continue
        if part.get_content_subtype() == "plain" and not plain_text:
            plain_text = content
        elif part.get_content_subtype() == "html" and not html_text:
            html_text = content
    return _plain_email_body(plain_text or html_text)


async def _normalize_existing_html_messages(db: AsyncSession) -> int:
    rows = (await db.scalars(
        select(EmailInboxMessage)
        .where(or_(
            EmailInboxMessage.text_body.ilike("%<%"),
            *(EmailInboxMessage.text_body.contains(char) for char in INVISIBLE_EMAIL_CHARS),
        ))
        .order_by(EmailInboxMessage.received_at.desc())
    )).all()
    updated = 0
    for message in rows:
        body = _plain_email_body(message.text_body)
        if body != message.text_body:
            message.text_body = body
            updated += 1
    return updated


def _header_text(message, name: str) -> str | None:
    value = message.get(name)
    return str(value).strip()[:998] if value else None


def _message_id(message, name: str) -> str | None:
    value = _header_text(message, name)
    matches = MESSAGE_ID_PATTERN.findall(value or "")
    return matches[0] if matches else None


def _message_references(message) -> list[str]:
    values = [str(value) for name in ("In-Reply-To", "References") for value in message.get_all(name, [])]
    return list(dict.fromkeys(match for value in values for match in MESSAGE_ID_PATTERN.findall(value)))


def _parse_remote_message(uid: int, raw: bytes) -> dict | None:
    settings = get_settings()
    message = BytesParser(policy=policy.default).parsebytes(raw[:MAX_MESSAGE_BYTES])
    addresses = getaddresses(message.get_all("From", []))
    from_name, from_email = next(((name, address) for name, address in addresses if address), ("", ""))
    if not from_email:
        logger.warning("Skipping mailbox message without sender uid=%s", uid)
        return None
    own_addresses = {address.casefold() for address in (
        settings.smtp_from_email,
        settings.smtp_username,
        *(mailbox.from_email for mailbox in settings.email_inbox_accounts.values()),
    ) if address}
    if from_email.casefold() in own_addresses:
        logger.debug("Skipping self-sent mailbox message uid=%s", uid)
        return None
    recipients = getaddresses(message.get_all("To", []))
    to_email = next((address for _, address in recipients if address), "")
    received_at = utc_now()
    date_header = message.get("Date")
    if date_header:
        try:
            received_at = parsedate_to_datetime(str(date_header))
            if received_at.tzinfo is None:
                received_at = received_at.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError, OverflowError):
            pass
    return {
        "uid": uid,
        "from_name": from_name[:180],
        "from_email": from_email[:320],
        "to_email": to_email[:320],
        "subject": (_header_text(message, "Subject") or "(no subject)")[:998],
        "text_body": _message_body(message),
        "message_id": _message_id(message, "Message-ID"),
        "in_reply_to": _message_id(message, "In-Reply-To"),
        "references_header": " ".join(_message_references(message)) or None,
        "received_at": received_at,
        "references": _message_references(message),
    }


def _fetch_messages_sync(
    mailbox: EmailInboxMailboxSettings,
    cursor: int,
    old_uid_validity: str | None,
) -> tuple[str, int, list[FetchedMessage]]:
    settings = get_settings()
    if not mailbox.imap_configured:
        raise MailboxSyncError("IMAP inbox settings are incomplete.")

    client = None
    try:
        if mailbox.imap_ssl:
            client = imaplib.IMAP4_SSL(
                mailbox.imap_host,
                mailbox.imap_port,
                ssl_context=create_proxy_compatible_ssl_context(),
                timeout=settings.smtp_timeout_seconds,
            )
        else:
            client = imaplib.IMAP4(
                mailbox.imap_host,
                mailbox.imap_port,
                timeout=settings.smtp_timeout_seconds,
            )
            client.starttls(ssl_context=create_proxy_compatible_ssl_context())
        try:
            client.login(mailbox.username, mailbox.password.get_secret_value())
        except imaplib.IMAP4.error as error:
            raise MailboxSyncError(
                "IMAP login rejected; check the mailbox username and app password."
            ) from error
        status, _ = client.select(mailbox.imap_mailbox, readonly=True)
        if status != "OK":
            raise MailboxSyncError("Could not select the configured IMAP mailbox.")
        _, uid_data = client.response("UIDVALIDITY")
        if not uid_data:
            raise MailboxSyncError("The IMAP server did not return UIDVALIDITY.")
        uid_validity = uid_data[0].decode("ascii") if isinstance(uid_data[0], bytes) else str(uid_data[0])

        # UIDVALIDITY resets invalidate the cursor; the initial import is bounded.
        # The caller supplies the cursor after this helper returns.
        return _fetch_selected_messages(client, uid_validity, cursor, old_uid_validity)
    except MailboxSyncError:
        raise
    except (imaplib.IMAP4.error, OSError, ssl.SSLError, UnicodeError, ValueError, TypeError) as error:
        raise MailboxSyncError(f"IMAP operation failed ({type(error).__name__}).") from error
    finally:
        if client is not None:
            try:
                client.logout()
            except (imaplib.IMAP4.error, OSError):
                logger.debug("IMAP logout did not complete")


def _fetch_selected_messages(
    client, uid_validity: str, cursor: int, old_uid_validity: str | None,
) -> tuple[str, int, list[FetchedMessage]]:
    settings = get_settings()
    if old_uid_validity != uid_validity:
        cursor = 0
    criterion = "ALL" if cursor == 0 else f"UID {cursor + 1}:*"
    status, data = client.uid("search", None, criterion)
    if status != "OK":
        raise MailboxSyncError("Could not list IMAP messages.")
    uids = [int(value) for value in (data[0] or b"").split()]
    candidates = [uid for uid in uids if uid > cursor]
    if cursor == 0:
        candidates = candidates[-settings.email_inbox_initial_sync_limit:]
    else:
        candidates = candidates[:settings.email_inbox_initial_sync_limit]

    fetched: list[FetchedMessage] = []
    for uid in candidates:
        status, response = client.uid("fetch", str(uid), f"(BODY.PEEK[]<0.{MAX_MESSAGE_BYTES}>)")
        if status != "OK":
            raise MailboxSyncError(f"Could not fetch IMAP message uid={uid}.")
        raw = next((item[1] for item in response or [] if isinstance(item, tuple) and isinstance(item[1], bytes)), None)
        if raw is not None:
            fetched.append(FetchedMessage(uid=uid, raw=raw))
    return uid_validity, max((item.uid for item in fetched), default=cursor), fetched


async def sync_portal_messages(db: AsyncSession) -> int:
    """Normalize existing inbox bodies and make storefront messages available."""
    await _normalize_existing_html_messages(db)
    imported = 0
    contacts = await db.scalars(select(ContactRequest).order_by(ContactRequest.created_at).limit(5000))
    for contact in contacts:
        imported += await _insert_if_new(db, {
            "id": uuid4(),
            "thread_key": f"contact:{contact.id}",
            "source_type": "contact_form",
            "source_key": str(contact.id),
            "direction": "inbound",
            "from_email": contact.email,
            "from_name": contact.name,
            "to_email": contact_notification_recipient(contact.request_type or ""),
            "subject": (contact.request_type or "Website contact")[:998],
            "text_body": contact.message[:MAX_MESSAGE_TEXT],
            "received_at": contact.created_at,
            "delivery_status": "received",
        })

    applications = await db.scalars(select(MakerApplication).order_by(MakerApplication.created_at).limit(5000))
    for application in applications:
        body = "\n".join((
            f"Maker: {application.maker_name}",
            f"Contact: {application.contact_person}",
            f"Country / city: {application.country} / {application.city}",
            f"Website: {application.website}",
            f"Social media: {application.social_media}",
            f"Product URL: {application.product_url}",
            f"Product description: {application.product_description}",
            f"Evidence of demand: {application.proven_desire_evidence}",
            f"Materials: {application.materials}",
            f"Price range: {application.price_range}",
            f"Ponyo exclusivity: {application.ponyo_exclusivity}",
        ))
        imported += await _insert_if_new(db, {
            "id": uuid4(),
            "thread_key": f"maker:{application.id}",
            "source_type": "maker_application",
            "source_key": str(application.id),
            "direction": "inbound",
            "from_email": application.email,
            "from_name": application.contact_person,
            "to_email": settings.partners_notification_email,
            "subject": f"Maker application — {application.maker_name}"[:998],
            "text_body": body[:MAX_MESSAGE_TEXT],
            "received_at": application.created_at,
            "delivery_status": "received",
        })
    await db.commit()
    return imported


async def sync_mailbox_once(db: AsyncSession) -> dict:
    settings = get_settings()
    mailboxes = {
        key: mailbox for key, mailbox in settings.email_inbox_accounts.items()
        if mailbox.imap_configured
    }
    if not mailboxes:
        raise MailboxSyncError("IMAP inbox settings are incomplete.")
    results = []
    for account_key, mailbox in mailboxes.items():
        state_key = mailbox_sync_state_key(account_key, mailbox)
        state = await db.get(EmailInboxSyncState, state_key)
        cursor = state.last_uid if state else 0
        old_uid_validity = state.uid_validity if state else None
        try:
            uid_validity, last_uid, fetched = await asyncio.to_thread(
                _fetch_messages_sync, mailbox, cursor, old_uid_validity,
            )
        except MailboxSyncError as error:
            safe_error = str(error)[:80]
            if state is None:
                state = EmailInboxSyncState(mailbox_name=state_key)
                db.add(state)
            state.last_error = safe_error
            await db.commit()
            results.append({
                "key": account_key,
                "imported": 0,
                "lastSyncedAt": state.last_synced_at,
                "error": safe_error,
            })
            continue

        imported = 0
        for remote in fetched:
            parsed = _parse_remote_message(remote.uid, remote.raw)
            if parsed is None:
                continue
            thread_key = None
            if parsed["references"]:
                thread_key = await db.scalar(
                    select(EmailInboxMessage.thread_key)
                    .where(EmailInboxMessage.message_id.in_(parsed["references"]))
                    .limit(1)
                )
            values = {
                "id": uuid4(),
                "thread_key": thread_key or f"mailbox:{uuid4()}",
                "source_type": "imap",
                "source_key": f"{account_key}:{uid_validity}:{remote.uid}",
                "direction": "inbound",
                "from_email": parsed["from_email"],
                "from_name": parsed["from_name"],
                "to_email": parsed["to_email"],
                "subject": parsed["subject"],
                "text_body": parsed["text_body"],
                "message_id": parsed["message_id"],
                "in_reply_to": parsed["in_reply_to"],
                "references_header": parsed["references_header"],
                "mailbox_name": account_key,
                "uid_validity": uid_validity,
                "uid": remote.uid,
                "received_at": parsed["received_at"],
                "delivery_status": "received",
            }
            imported += await _insert_if_new(db, values)

        if state is None:
            state = EmailInboxSyncState(mailbox_name=state_key)
            db.add(state)
        state.uid_validity = uid_validity
        state.last_uid = last_uid
        state.last_synced_at = utc_now()
        state.last_error = None
        await db.commit()
        results.append({
            "key": account_key,
            "imported": imported,
            "lastSyncedAt": state.last_synced_at,
            "error": None,
        })

    return {
        "imported": sum(result["imported"] for result in results),
        "lastSyncedAt": max(
            (result["lastSyncedAt"] for result in results if result["lastSyncedAt"]),
            default=None,
        ),
        "mailboxes": results,
    }


def mailbox_message_id(notification_key: str) -> str:
    digest = hashlib.sha256(notification_key.encode()).hexdigest()
    return f"<{digest}@mail.byponyo.com>"


async def email_inbox_worker() -> None:
    settings = get_settings()
    while True:
        try:
            async with SessionLocal() as db:
                await sync_portal_messages(db)
                result = await sync_mailbox_once(db)
                failed = [row["key"] for row in result["mailboxes"] if row["error"]]
                if failed:
                    logger.warning("Admin email inbox mailbox sync failed mailbox_count=%s", len(failed))
        except MailboxSyncError:
            logger.info("Admin email inbox worker is waiting for complete mailbox settings")
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning("Admin email inbox sync failed exception_type=%s", type(error).__name__)
        await asyncio.sleep(settings.email_inbox_sync_interval_seconds)
