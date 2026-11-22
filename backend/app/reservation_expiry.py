"""Recover missed expiry webhooks only after Stripe confirms expired/unpaid.

The local deadline selects candidates; it is never evidence of non-payment.
Provider calls run without database locks, then each order is rechecked and
settled in its own transaction, sharing the webhook's order lock.
"""

import asyncio
import logging
from collections.abc import Callable, Mapping
from datetime import datetime, timezone

import stripe
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.config import settings
from app.email_queue import enqueue_email_notification
from app.inventory import restore_variant_stock, settle_supplier_stock
from app.models import Order, OrderItem, OrderStatusHistory, OutboxEvent, Product, ProductReservation, ProductVariant
from app.payments import record_transaction

logger = logging.getLogger("ponyo.reservation_expiry")
BATCH_SIZE = 100
POLL_INTERVAL = 60


def provider_status(session_id: str) -> Mapping:
    """Synchronous Stripe lookup/expiry, invoked in a thread by the sweeper."""
    stripe.api_key = settings.stripe_secret_key
    session = stripe.checkout.Session.retrieve(session_id)
    if (isinstance(session, Mapping) and session.get("id") == session_id
            and session.get("status") == "open" and session.get("payment_status") == "unpaid"):
        session = stripe.checkout.Session.expire(session_id)
    return session


def _confirmed_expired(session, session_id: str, order_id) -> bool:
    if not isinstance(session, Mapping):
        return False
    if (session.get("id") != session_id or session.get("status") != "expired"
            or session.get("payment_status") != "unpaid"):
        return False
    # Stored provider ID is sufficient, but reject contradictory references.
    metadata = session.get("metadata")
    if metadata is not None and not isinstance(metadata, Mapping):
        return False
    reference = (metadata or {}).get("ponyo_order_id")
    client_reference = session.get("client_reference_id")
    return all(value is None or value == str(order_id) for value in (reference, client_reference))


async def expire_reservations(
    db: AsyncSession,
    now: datetime | None = None,
    provider: Callable[[str], Mapping] | None = None,
) -> int:
    """Use a dedicated injected session; commit/rollback separately per order."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    eligible = (
        Order.status == "pending_payment", Order.payment_status == "unpaid",
        Order.payment_provider == "stripe", Order.reservation_expires_at <= now,
    )
    candidates = (await db.execute(
        select(Order.id, Order.stripe_session_id, Order.reservation_expires_at)
        .where(*eligible).order_by(Order.reservation_expires_at, Order.id).limit(BATCH_SIZE)
    )).all()
    # End the scan transaction before contacting Stripe (no long-lived snapshot).
    await db.rollback()
    released = 0
    for order_id, session_id, _deadline in candidates:
        try:
            if session_id is None:
                # The checkout URL is not returned until its session ID is committed.
                # Therefore a session-less reservation cannot be used by a customer
                # and can be released after its saved provider expiry deadline.
                order = await db.scalar(select(Order).where(
                    Order.id == order_id, *eligible, Order.stripe_session_id.is_(None),
                ).with_for_update().execution_options(populate_existing=True))
                if order is None:
                    await db.rollback()
                    continue
                result = await db.execute(update(Order).where(
                    Order.id == order_id, *eligible, Order.stripe_session_id.is_(None),
                ).values(status="cancelled", payment_status="failed").execution_options(synchronize_session=False))
                if result.rowcount != 1:
                    await db.rollback()
                    continue
                items = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order_id))).all()
                variant_ids = {item.variant_id for item in items}
                locked_ids = set((await db.scalars(
                    select(ProductVariant.id).where(ProductVariant.id.in_(variant_ids))
                    .order_by(ProductVariant.id).with_for_update()
                )).all())
                if locked_ids != variant_ids:
                    raise RuntimeError("Reservation variant is unavailable")
                for item in sorted(items, key=lambda item: item.variant_id):
                    await settle_supplier_stock(db, item, paid=False)
                    await restore_variant_stock(db, item)
                db.add(OrderStatusHistory(
                    order_id=order_id, from_status="pending_payment", to_status="cancelled",
                    payment_status="failed", fulfillment_status=order.fulfillment_status,
                    source="reservation_expiry", event_key=f"checkout.session_missing:{order_id}",
                ))
                await record_transaction(db, order, kind="void", status="succeeded", amount=order.total_amount,
                                         reference=None, key=f"void:{order.id}")
                event = OutboxEvent(event_type="order.reservation_expired",
                                    payload={"orderId": str(order_id), "orderNumber": order.order_number})
                enqueue_email_notification(
                    db, event, template="cancellation_notification", recipient=order.customer_email,
                    payload={"orderNumber": order.order_number,
                             "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                             "reason": "Checkout payment was not completed before it expired."},
                )
                await db.commit()
                released += 1
                continue
            session = await asyncio.to_thread(provider or provider_status, session_id)
            if not _confirmed_expired(session, session_id, order_id):
                continue
            order = await db.scalar(
                select(Order).where(Order.id == order_id, *eligible, Order.stripe_session_id == session_id)
                .with_for_update().execution_options(populate_existing=True)
            )
            if order is None:
                await db.rollback()
                continue
            result = await db.execute(
                update(Order).where(Order.id == order_id, *eligible, Order.stripe_session_id == session_id)
                .values(status="cancelled", payment_status="failed")
                .execution_options(synchronize_session=False)
            )
            if result.rowcount != 1:
                await db.rollback()
                continue
            items = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order_id))).all()
            variant_ids = {item.variant_id for item in items}
            locked_ids = set((await db.scalars(
                select(ProductVariant.id).where(ProductVariant.id.in_(variant_ids))
                .order_by(ProductVariant.id).with_for_update()
            )).all())
            if locked_ids != variant_ids:
                raise RuntimeError("Reservation variant is unavailable")
            # Lock all variants before taking supplier locks, like checkout.
            for item in sorted(items, key=lambda item: item.variant_id):
                await settle_supplier_stock(db, item, paid=False)
                await restore_variant_stock(db, item)
            db.add(OrderStatusHistory(
                order_id=order_id, from_status="pending_payment", to_status="cancelled",
                payment_status="failed", fulfillment_status=order.fulfillment_status,
                source="reservation_expiry", event_key=f"reservation.expired:{order_id}",
            ))
            await record_transaction(db, order, kind="void", status="succeeded", amount=order.total_amount,
                                     reference=session_id, key=f"void:{order.id}")
            event = OutboxEvent(
                event_type="order.reservation_expired",
                payload={"orderId": str(order_id), "orderNumber": order.order_number},
            )
            enqueue_email_notification(
                db, event, template="cancellation_notification", recipient=order.customer_email,
                payload={"orderNumber": order.order_number,
                         "orderUrl": f"{settings.storefront_base_url.rstrip('/')}/orders",
                         "reason": "Checkout payment was not completed before it expired."},
            )
            await db.commit()
            released += 1
        except Exception as error:
            await db.rollback()
            logger.warning("Reservation recovery skipped exception_type=%s", type(error).__name__)
    return released


async def expire_product_reservation_campaigns(
    db: AsyncSession,
    now: datetime | None = None,
) -> int:
    """Close campaigns that missed their configured deadline and notify reservers."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    today = now.date()
    product_ids = list((await db.scalars(
        select(Product.id)
        .where(
            Product.production_status == "collecting",
            Product.reservation_deadline.is_not(None),
            Product.reservation_deadline < today,
        )
        .order_by(Product.reservation_deadline, Product.id)
        .limit(BATCH_SIZE)
    )).all())
    await db.rollback()
    closed = 0
    for product_id in product_ids:
        try:
            product = await db.scalar(select(Product).where(
                Product.id == product_id,
                Product.production_status == "collecting",
                Product.reservation_deadline < today,
            ).with_for_update())
            if product is None:
                await db.rollback()
                continue
            count = await db.scalar(select(func.count()).select_from(ProductReservation).where(
                ProductReservation.product_id == product.id,
            )) or 0
            if product.reservation_target is not None and count >= product.reservation_target:
                product.reservations_open = False
                product.production_status = "target_reached"
                product.reservation_minimum_reached_at = product.reservation_minimum_reached_at or now
                db.add(OutboxEvent(event_type="product.reservation_minimum_reached", payload={
                    "productId": str(product.id),
                    "productName": product.name,
                    "reservationCount": count,
                    "target": product.reservation_target,
                }))
                await db.commit()
                closed += 1
                continue

            product.reservations_open = False
            product.production_status = "target_missed"
            product.reservation_target_missed_at = now
            reservations = list((await db.scalars(
                select(ProductReservation).where(ProductReservation.product_id == product.id)
                .order_by(ProductReservation.created_at, ProductReservation.id)
            )).all())
            product_url = f"{settings.storefront_base_url.rstrip('/')}/products/{product.slug}"
            for reservation in reservations:
                event = OutboxEvent(
                    event_type="product.reservation_target_missed",
                    payload={"productId": str(product.id), "reservationId": str(reservation.id)},
                )
                enqueue_email_notification(
                    db,
                    event,
                    template="reservation_target_missed",
                    recipient=reservation.email,
                    payload={"productName": product.name, "productUrl": product_url},
                    notification_key=f"reservation_target_missed:{reservation.id}",
                )
            await db.commit()
            closed += 1
        except Exception as error:
            await db.rollback()
            logger.warning("Product reservation deadline processing failed exception_type=%s", type(error).__name__)
    return closed


async def recover_expired_reservations(session_factory=SessionLocal) -> None:
    """Recover checkout reservations and process product campaign deadlines."""
    while True:
        try:
            async with session_factory() as db:
                await expire_product_reservation_campaigns(db)
                if settings.stripe_secret_key:
                    await expire_reservations(db)
        except Exception as error:
            logger.warning("Reservation recovery retry exception_type=%s", type(error).__name__)
        await asyncio.sleep(POLL_INTERVAL)