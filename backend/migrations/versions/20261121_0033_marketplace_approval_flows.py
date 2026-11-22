"""Add reservation campaign states and supplier offer approval requests."""

from alembic import op
import sqlalchemy as sa


revision = "20261121_0033"
down_revision = "20261120_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("reservation_deadline", sa.Date(), nullable=True))
    op.add_column(
        "products",
        sa.Column("production_status", sa.String(length=32), server_default="collecting", nullable=False),
    )
    op.add_column("products", sa.Column("production_approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("products", sa.Column("preorder_invites_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("products", sa.Column("reservation_target_missed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_products_production_deadline",
        "products",
        ["production_status", "reservation_deadline"],
    )
    connection = op.get_bind()
    products = sa.table(
        "products",
        sa.column("reservation_minimum_reached_at", sa.DateTime(timezone=True)),
        sa.column("production_status", sa.String(length=32)),
        sa.column("reservations_open", sa.Boolean()),
    )
    connection.execute(
        sa.update(products)
        .where(products.c.reservation_minimum_reached_at.is_not(None))
        .values(production_status="target_reached", reservations_open=False)
    )
    op.add_column(
        "supplier_offers",
        sa.Column("is_primary", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index(
        "uq_supplier_offers_primary_variant",
        "supplier_offers",
        ["variant_id"],
        unique=True,
        postgresql_where=sa.text("is_primary = true"),
        sqlite_where=sa.text("is_primary = 1"),
    )

    offers = sa.table(
        "supplier_offers",
        sa.column("variant_id", sa.Uuid()),
        sa.column("is_primary", sa.Boolean()),
    )
    other_offers = offers.alias("other_offers")
    variant_offer_count = (
        sa.select(sa.func.count())
        .select_from(other_offers)
        .where(other_offers.c.variant_id == offers.c.variant_id)
        .scalar_subquery()
    )
    connection.execute(
        sa.update(offers)
        .where(variant_offer_count == 1)
        .values(is_primary=True)
    )

    op.create_table(
        "supplier_offer_change_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("offer_id", sa.Uuid(), nullable=False),
        sa.Column("production_capacity", sa.Integer(), nullable=False),
        sa.Column("cost_amount", sa.Integer(), nullable=False),
        sa.Column("minimum_order_quantity", sa.Integer(), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.CheckConstraint("production_capacity >= 0", name="ck_supplier_offer_change_capacity"),
        sa.CheckConstraint("cost_amount >= 0", name="ck_supplier_offer_change_cost"),
        sa.CheckConstraint("minimum_order_quantity > 0", name="ck_supplier_offer_change_minimum"),
        sa.CheckConstraint("lead_time_days >= 0", name="ck_supplier_offer_change_lead_time"),
        sa.ForeignKeyConstraint(["offer_id"], ["supplier_offers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_supplier_offer_change_requests_offer_id",
        "supplier_offer_change_requests",
        ["offer_id"],
    )
    op.create_index(
        "ix_supplier_offer_change_requests_status",
        "supplier_offer_change_requests",
        ["status"],
    )
    op.create_index(
        "ix_supplier_offer_change_requests_supplier_id",
        "supplier_offer_change_requests",
        ["supplier_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_supplier_offer_change_requests_supplier_id", table_name="supplier_offer_change_requests")
    op.drop_index("ix_supplier_offer_change_requests_status", table_name="supplier_offer_change_requests")
    op.drop_index("ix_supplier_offer_change_requests_offer_id", table_name="supplier_offer_change_requests")
    op.drop_table("supplier_offer_change_requests")
    op.drop_index("uq_supplier_offers_primary_variant", table_name="supplier_offers")
    op.drop_column("supplier_offers", "is_primary")
    op.drop_index("ix_products_production_deadline", table_name="products")
    op.drop_column("products", "reservation_target_missed_at")
    op.drop_column("products", "preorder_invites_sent_at")
    op.drop_column("products", "production_approved_at")
    op.drop_column("products", "production_status")
    op.drop_column("products", "reservation_deadline")
