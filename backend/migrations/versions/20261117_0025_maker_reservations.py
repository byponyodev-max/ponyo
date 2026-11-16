"""Add maker profiles, proof fields, reservations, and maker applications."""

from alembic import op
import sqlalchemy as sa

revision = "20261117_0025"
down_revision = "20261116_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brands", sa.Column("profile_image_url", sa.Text(), nullable=True))
    op.add_column("brands", sa.Column("maker_story", sa.Text(), nullable=True))
    op.add_column("brands", sa.Column("philosophy", sa.Text(), nullable=True))
    op.add_column("brands", sa.Column("process", sa.Text(), nullable=True))
    op.add_column("brands", sa.Column("location", sa.String(length=180), nullable=True))
    op.add_column("brands", sa.Column("specialties", sa.JSON(), nullable=True))
    op.add_column("brands", sa.Column("website", sa.String(length=500), nullable=True))
    op.add_column("brands", sa.Column("social_media", sa.String(length=500), nullable=True))

    op.add_column("products", sa.Column("materials", sa.Text(), nullable=True))
    op.add_column("products", sa.Column("weight_grams", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("edition_count", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("estimated_delivery_date", sa.Date(), nullable=True))
    op.add_column("products", sa.Column("only_at_ponyo", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("products", sa.Column("reservations_open", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column("products", sa.Column("reservation_target", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_products_weight_nonnegative", "products", "weight_grams IS NULL OR weight_grams >= 0")
    op.create_check_constraint("ck_products_edition_positive", "products", "edition_count IS NULL OR edition_count > 0")
    op.create_check_constraint("ck_products_reservation_target_positive", "products", "reservation_target IS NULL OR reservation_target > 0")

    op.create_table(
        "product_reservations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("country", sa.String(length=100), nullable=False),
        sa.Column("accepted_disclaimer_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "email", name="uq_product_reservations_product_email"),
    )
    op.create_index("ix_product_reservations_product_id", "product_reservations", ["product_id"])
    op.create_index("ix_product_reservations_email", "product_reservations", ["email"])

    op.create_table(
        "maker_applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("maker_name", sa.String(length=180), nullable=False),
        sa.Column("contact_person", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("country", sa.String(length=100), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("website", sa.String(length=500), server_default="", nullable=False),
        sa.Column("social_media", sa.String(length=500), server_default="", nullable=False),
        sa.Column("product_url", sa.String(length=500), nullable=False),
        sa.Column("product_description", sa.Text(), nullable=False),
        sa.Column("proven_desire_evidence", sa.Text(), nullable=False),
        sa.Column("materials", sa.Text(), nullable=False),
        sa.Column("price_range", sa.String(length=160), nullable=False),
        sa.Column("product_photos", sa.JSON(), nullable=False),
        sa.Column("ponyo_exclusivity", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_maker_applications_email", "maker_applications", ["email"])
    op.create_index("ix_maker_applications_status", "maker_applications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_maker_applications_status", table_name="maker_applications")
    op.drop_index("ix_maker_applications_email", table_name="maker_applications")
    op.drop_table("maker_applications")
    op.drop_index("ix_product_reservations_email", table_name="product_reservations")
    op.drop_index("ix_product_reservations_product_id", table_name="product_reservations")
    op.drop_table("product_reservations")

    op.drop_constraint("ck_products_reservation_target_positive", "products", type_="check")
    op.drop_constraint("ck_products_edition_positive", "products", type_="check")
    op.drop_constraint("ck_products_weight_nonnegative", "products", type_="check")
    for column in (
        "reservation_target", "reservations_open", "only_at_ponyo", "estimated_delivery_date",
        "edition_count", "weight_grams", "materials",
    ):
        op.drop_column("products", column)

    for column in ("social_media", "website", "specialties", "location", "process", "philosophy", "maker_story", "profile_image_url"):
        op.drop_column("brands", column)
