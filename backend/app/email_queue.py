"""Transactional email enqueueing and retry worker."""

import asyncio
import hashlib
import html
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.currency import CURRENCY_DIGITS
from app.db import SessionLocal
from app.email_notifications import ponyo_branded_email_html, send_transactional_email
from app.models import ContactRequest, EmailInboxMessage, EmailNotification, OutboxEvent, utc_now

logger = logging.getLogger("ponyo.email_queue")
MAX_ATTEMPTS = 10
LEASE_SECONDS = 300


def enqueue_email_notification(
    db: AsyncSession, event: OutboxEvent, *, template: str, recipient: str, payload: dict,
    notification_key: str | None = None,
) -> None:
    """Store a notification in the same DB transaction as its business event."""
    from uuid import uuid4

    if event.id is None:
        event.id = uuid4()
    db.add(event)
    db.add(EmailNotification(
        outbox_event_id=event.id,
        notification_key=notification_key or f"{event.id}:{template}",
        recipient=recipient,
        template=template,
        payload=payload,
    ))


def _money(amount: int, currency: str) -> str:
    code = currency.upper()
    digits = CURRENCY_DIGITS.get(code, 2)
    value = Decimal(amount) / (10 ** digits)
    return f"{value:,.{digits}f} {code}"


def _detail_panel(rows: list[tuple[str, str]]) -> str:
    row_html = "".join(
        '<tr><td style="padding:11px 15px;border-bottom:1px solid #eee4dc;color:#88766b;'
        'font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px">'
        f"{html.escape(label)}</td><td align=\"right\" style=\"padding:11px 15px;border-bottom:1px solid #eee4dc;"
        f'color:#3f302b;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;line-height:19px">'
        f"{html.escape(value)}</td></tr>"
        for label, value in rows
    )
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="margin-top:22px;border:1px solid #eedfd5;border-radius:15px;background:#fffaf6">'
        f"{row_html}</table>"
    )


def _content(notification: EmailNotification) -> tuple[str, str, str]:
    payload = notification.payload
    template = notification.template
    if template in {
        "maker_onboarding_invitation",
        "supplier_portal_invitation",
        "maker_onboarding_review_requested",
        "supplier_product_review_requested",
    }:
        maker_name = str(payload.get("makerName", "maker")).strip()[:180]
        invite_url = str(payload.get("inviteUrl", payload.get("reviewUrl", ""))).strip()
        parsed_url = urlsplit(invite_url)
        if parsed_url.scheme != "https" and not (
            parsed_url.scheme == "http" and parsed_url.hostname in {"localhost", "127.0.0.1"}
        ):
            invite_url = ""
        if template == "maker_onboarding_invitation":
            subject = "Your Ponyo maker application was accepted"
            title = "Let’s get your partnership started."
            intro = f"Good news, {maker_name} — your maker application has been accepted."
            action = "Complete onboarding"
            footnote = "Acceptance is the first step. Your supplier account and products will only be activated after review."
        elif template == "supplier_portal_invitation":
            subject = "Your Ponyo Supplier Portal invitation"
            title = "Your Supplier Portal is ready."
            intro = f"Your Ponyo partnership setup for {maker_name} is approved. Activate your Supplier Portal access to continue."
            action = "Activate Supplier Portal"
            footnote = "This one-time invitation expires in 14 days. Your supplier account becomes active when you accept."
        elif template == "maker_onboarding_review_requested":
            subject = f"Maker onboarding ready for review: {maker_name}"
            title = "A maker partner is ready for review."
            intro = f"{maker_name} submitted partner onboarding details for Ponyo review."
            action = "Review onboarding"
            footnote = "Review the partnership information in the Admin Portal before creating the brand and supplier records."
        else:
            product_name = str(payload.get("productName", "a product")).strip()[:240]
            subject = f"Supplier product ready for review: {product_name}"
            title = "A supplier product draft is ready."
            intro = f"{maker_name} submitted {product_name} for Ponyo product review."
            action = "Review product draft"
            footnote = "Approval creates an unpublished catalog product. Review its details and photos before approving."
        text = (
            f"Hello,\n\n{intro}\n\n"
            + (f"Continue here: {invite_url}\n\n" if invite_url else "")
            + f"{footnote}\n\nWith care, The Ponyo team"
        )
        html_body = ponyo_branded_email_html(
            eyebrow="YOUR PONYO PARTNERSHIP",
            title=title,
            intro=intro,
            action_label=action if invite_url else None,
            action_url=invite_url or None,
            footnote=footnote,
        )
        return subject, text, html_body
    if template == "admin_email_reply":
        subject = str(payload["subject"])[:998]
        text = str(payload["body"])
        safe_body = html.escape(text).replace("\n", "<br>")
        html_body = ponyo_branded_email_html(
            eyebrow="A reply from Ponyo",
            title=subject,
            intro="Our team has replied to your message.",
            content_html=(
                '<div style="margin-top:22px;padding:18px;border:1px solid #eedfd5;'
                f'border-radius:15px;background:#fffaf6;color:#3f302b;line-height:24px">{safe_body}</div>'
            ),
        )
        return subject, text, html_body
    if template == "product_availability":
        product_name = str(payload["productName"]).strip()[:240]
        first_name = str(payload.get("firstName", "")).strip()[:120]
        product_url = str(payload.get("productUrl", "")).strip()
        parsed_url = urlsplit(product_url)
        if parsed_url.scheme != "https" and not (
            parsed_url.scheme == "http" and parsed_url.hostname in {"localhost", "127.0.0.1"}
        ):
            product_url = ""
        subject = f"{product_name} is available now"
        greeting = f"Hi {first_name}," if first_name else "Hello,"
        intro = f"The product you asked us about, {product_name}, is now available."
        lines = [greeting, intro]
        if product_url:
            lines.append(f"View the product: {product_url}")
        lines.extend([
            "You received this because you asked for an availability alert for this product.",
            "With care, The Ponyo team",
        ])
        html_body = ponyo_branded_email_html(
            eyebrow="A little Ponyo update",
            title=f"{product_name} is ready",
            intro=intro,
            content_html=_detail_panel([("Product", product_name)]),
            action_label="View product" if product_url else None,
            action_url=product_url or None,
            footnote="You received this one-time alert because you joined this product’s availability waitlist.",
        )
        return subject, "\n\n".join(lines), html_body
    if template in {"reservation_preorder_invitation", "reservation_target_missed"}:
        product_name = str(payload["productName"]).strip()[:240]
        product_url = str(payload.get("productUrl", "")).strip()
        parsed_url = urlsplit(product_url)
        if parsed_url.scheme != "https" and not (
            parsed_url.scheme == "http" and parsed_url.hostname in {"localhost", "127.0.0.1"}
        ):
            product_url = ""
        if template == "reservation_preorder_invitation":
            subject = f"A Ponyo production update for {product_name}"
            intro = f"The maker is ready to begin planning production for {product_name}."
            text = (
                f"Hello,\n\n{intro}\n\n"
                "You reserved a spot, so you’re receiving this priority update. This is not an order, "
                "and no payment has been taken. Ponyo will contact you again when paid preorders are ready.\n\n"
                "With care, The Ponyo team"
            )
            eyebrow = "A PRIORITY PONYO UPDATE"
            title = "A little production milestone."
            footnote = "This is an update for a reservation you made. It is not an order and no payment has been taken."
        else:
            subject = f"An update about {product_name}"
            intro = f"The reservation period for {product_name} ended before the production target was reached."
            text = (
                f"Hello,\n\n{intro}\n\n"
                "Your reservation was non-binding, so there is no order to cancel and no payment to refund. "
                "We’ll share another update if the maker plans a new production round.\n\n"
                "With care, The Ponyo team"
            )
            eyebrow = "A PONYO RESERVATION UPDATE"
            title = "This reservation round has closed."
            footnote = "Your reservation did not create an order or payment."
        html_body = ponyo_branded_email_html(
            eyebrow=eyebrow,
            title=title,
            intro=intro,
            content_html=_detail_panel([("Product", product_name)]),
            action_label="View product update" if product_url else None,
            action_url=product_url or None,
            footnote=footnote,
        )
        return subject, text, html_body
    if template == "newsletter_campaign":
        subject = str(payload["subject"]).strip()[:200]
        body = str(payload["body"]).strip()[:10000].replace("\r\n", "\n").replace("\r", "\n")
        unsubscribe_url = str(payload["unsubscribeUrl"]).strip()
        parsed_url = urlsplit(unsubscribe_url)
        safe_url = bool(
            (parsed_url.scheme == "https" and parsed_url.netloc and not parsed_url.username and not parsed_url.password)
            or (parsed_url.scheme == "http" and parsed_url.hostname in {"localhost", "127.0.0.1"})
        )
        if not subject or not body or not safe_url:
            raise ValueError("Newsletter email content is invalid.")
        safe_body = html.escape(body).replace("\n", "<br>")
        safe_unsubscribe_url = html.escape(unsubscribe_url, quote=True)
        text = (
            f"{body}\n\nYou received this because you subscribed to Ponyo newsletter updates.\n"
            f"Unsubscribe: {unsubscribe_url}\n\nWith care, The Ponyo team"
        )
        html_body = ponyo_branded_email_html(
            eyebrow="PONYO NEWSLETTER",
            title=subject,
            intro="A little update from Ponyo.",
            content_html=(
                '<div style="margin-top:22px;padding:18px;border:1px solid #eedfd5;'
                f'border-radius:15px;background:#fffaf6;color:#3f302b;line-height:24px">{safe_body}</div>'
                '<p style="margin:22px 0 0;color:#75645a;font-size:12px;line-height:19px">'
                'You received this because you subscribed to Ponyo newsletter updates. '
                f'<a href="{safe_unsubscribe_url}" style="color:#a2502f">Unsubscribe</a></p>'
            ),
            footer_note="This newsletter was sent because you subscribed to Ponyo updates.",
        )
        return subject, text, html_body
    order_number = str(payload.get("orderNumber", "your order"))
    order_url = str(payload.get("orderUrl", ""))
    lines: list[str]
    rows: list[tuple[str, str]] = []
    title: str
    eyebrow = "A little Ponyo update"
    intro = "Here’s a little update from Ponyo."
    panel = ""
    action_label = "View your order"
    action_url = order_url
    footnote = "Thank you for letting Ponyo be part of your world."
    if template == "order_confirmation":
        eyebrow = "A new plush adventure"
        title = "Your order is in good hands."
        intro = f"Thank you for choosing Ponyo. We’ve received order {order_number} and are getting it ready."
        currency = str(payload.get("currency", "JPY"))
        for index, item in enumerate(payload.get("items", []), start=1):
            name = str(item.get("name", "Ponyo plush"))
            quantity = int(item.get("quantity", 0))
            lines_for_item = f"{name} × {quantity}"
            rows.append((f"Plush friend {index}", lines_for_item))
        rows.append(("Order total", _money(int(payload.get("totalAmount", 0)), currency)))
        panel = _detail_panel(rows)
        lines = [f"Your Ponyo order {order_number} is confirmed."]
        lines.extend(f"• {name} × {int(item.get('quantity', 0))}" for item in payload.get("items", [])
                     for name in [str(item.get("name", "Ponyo plush"))])
        lines.append(f"Order total: {_money(int(payload.get('totalAmount', 0)), currency)}")
        footnote = "We’ll send another note as your parcel begins its journey."
    elif template == "payment_confirmation":
        eyebrow = "Payment received"
        title = "Thank you, it’s all set."
        intro = f"Payment for order {order_number} has been confirmed securely."
        amount = _money(int(payload.get("amount", 0)), str(payload.get("currency", "JPY")))
        panel = _detail_panel([("Order number", order_number), ("Paid", amount)])
        lines = [f"Payment confirmed for order {order_number}.", f"Amount: {amount}"]
    elif template == "shipping_notification":
        eyebrow = "A little parcel is on its way"
        title = "Your plush has left the nest."
        intro = f"Order {order_number} is on its way to you. You can follow its journey below."
        carrier = str(payload.get("carrier", "Carrier"))
        tracking_number = str(payload.get("trackingNumber", "Not provided"))
        rows = [("Delivery partner", carrier), ("Tracking number", tracking_number)]
        if payload.get("estimatedDeliveryAt"):
            rows.append(("Estimated delivery", str(payload["estimatedDeliveryAt"])))
        panel = _detail_panel(rows)
        tracking_url = str(payload.get("trackingUrl") or "")
        if tracking_url.startswith("https://"):
            action_label, action_url = "Track your parcel", tracking_url
        lines = [f"Order {order_number} is on its way.", f"Carrier: {carrier}", f"Tracking number: {tracking_number}"]
        if payload.get("estimatedDeliveryAt"):
            lines.append(f"Estimated delivery: {payload['estimatedDeliveryAt']}")
        footnote = "Tracking scans can take a little while to appear after dispatch."
    elif template == "delivery_notification":
        eyebrow = "A happy arrival"
        title = "Your new friend is home."
        carrier = str(payload.get("carrier", "Your delivery partner"))
        intro = f"{carrier} marked order {order_number} as delivered. We hope your new plush brings a little joy."
        tracking_number = str(payload.get("trackingNumber", ""))
        rows = [("Order number", order_number), ("Delivery partner", carrier)]
        if tracking_number:
            rows.append(("Tracking number", tracking_number))
        panel = _detail_panel(rows)
        lines = [intro]
        footnote = "Need a hand? Reply to this email and our little team will help."
    elif template == "cancellation_notification":
        eyebrow = "Order update"
        title = "Your order has been cancelled."
        intro = f"Order {order_number} is no longer active. If you have questions, our team is here to help."
        reason = str(payload.get("reason") or "Cancellation confirmed by Ponyo.")
        panel = _detail_panel([("Order number", order_number), ("Update", reason)])
        lines = [intro, f"Reason: {reason}"]
        footnote = "If this doesn’t look right, contact Ponyo and we’ll take a closer look."
    elif template == "refund_notification":
        eyebrow = "A little money update"
        title = "Your refund is on its way."
        amount = _money(int(payload.get("amount", 0)), str(payload.get("currency", "JPY")))
        intro = f"A refund for order {order_number} has been processed."
        panel = _detail_panel([("Order number", order_number), ("Refund amount", amount)])
        lines = [intro, f"Refund amount: {amount}", "Your bank or card provider may need extra time to post the funds."]
        footnote = "The time it takes to appear depends on your bank or card provider."
    else:
        raise ValueError("Unsupported transactional email template")

    lines.append("With care, The Ponyo team")
    text = "\n\n".join(lines)
    html_body = ponyo_branded_email_html(
        eyebrow=eyebrow, title=title, intro=intro, content_html=panel,
        action_label=action_label if action_url else None, action_url=action_url if action_url else None,
        footnote=footnote,
    )
    return title, text, html_body


async def send_one(db: AsyncSession) -> bool:
    now = utc_now()
    notification = await db.scalar(
        select(EmailNotification)
        .where(
            or_(
                (EmailNotification.status == "pending") &
                (EmailNotification.next_attempt_at.is_(None) | (EmailNotification.next_attempt_at <= now)),
                (EmailNotification.status == "processing") & (EmailNotification.lease_until <= now),
            )
        )
        .order_by(EmailNotification.created_at, EmailNotification.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if notification is None:
        return False
    notification.status = "processing"
    notification.attempts += 1
    notification.lease_until = now + timedelta(seconds=LEASE_SECONDS)
    if notification.template == "admin_email_reply":
        reply_message = await db.scalar(
            select(EmailInboxMessage).where(
                EmailInboxMessage.source_type == "admin_reply",
                EmailInboxMessage.source_key == str(notification.payload.get("idempotencyKey", "")),
            )
        )
        if reply_message is not None:
            reply_message.delivery_status = "sending"
    await db.commit()
    try:
        subject, text_body, html_body = _content(notification)
        message_digest = hashlib.sha256(notification.notification_key.encode()).hexdigest()
        message_id = f"<{message_digest}@mail.byponyo.com>"
        threading_headers = {"mailbox_key": notification.payload.get("mailboxKey")}
        if notification.template == "admin_email_reply":
            threading_headers = {
                "in_reply_to": notification.payload.get("inReplyTo"),
                "references": notification.payload.get("references"),
                "mailbox_key": notification.payload.get("mailboxKey"),
            }
        sent = await send_transactional_email(
            notification.recipient, subject, text_body, html_body, message_id,
            **threading_headers,
        )
    except Exception as error:
        logger.warning("Email notification preparation failed id=%s exception_type=%s",
                       notification.notification_key, type(error).__name__)
        sent = False
        error_name = type(error).__name__
    else:
        error_name = "DeliveryFailed"
    current = await db.get(EmailNotification, notification.id, populate_existing=True)
    if sent:
        current.status = "sent"
        current.sent_at = datetime.now(timezone.utc)
        current.last_error = None
        current.lease_until = None
        reply_status = "sent"
    elif current.attempts >= MAX_ATTEMPTS:
        current.status = "failed"
        current.last_error = error_name[:80]
        current.lease_until = None
        reply_status = "failed"
        logger.error("Email notification exhausted retries id=%s", current.notification_key)
    else:
        current.status = "pending"
        current.last_error = error_name[:80]
        current.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=min(3600, 15 * (2 ** (current.attempts - 1))))
        current.lease_until = None
        reply_status = "queued"
        logger.warning("Email notification scheduled retry id=%s attempt=%s",
                       current.notification_key, current.attempts)
    if current.template == "admin_email_reply":
        reply_message = await db.scalar(
            select(EmailInboxMessage).where(
                EmailInboxMessage.source_type == "admin_reply",
                EmailInboxMessage.source_key == str(current.payload.get("idempotencyKey", "")),
            )
        )
        if reply_message is not None:
            reply_message.delivery_status = reply_status
            if sent:
                contact_key = await db.scalar(
                    select(EmailInboxMessage.source_key).where(
                        EmailInboxMessage.thread_key == reply_message.thread_key,
                        EmailInboxMessage.source_type == "contact_form",
                    ).limit(1)
                )
                if contact_key:
                    contact = await db.get(ContactRequest, UUID(contact_key))
                    if contact is not None:
                        contact.status = "replied"
    await db.commit()
    return True


async def transactional_email_worker() -> None:
    while True:
        try:
            async with SessionLocal() as db:
                processed = await send_one(db)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning("Email notification worker iteration failed exception_type=%s", type(error).__name__)
            processed = False
        if not processed:
            await asyncio.sleep(2)
