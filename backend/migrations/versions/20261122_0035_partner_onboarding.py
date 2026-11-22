"""Connect accepted maker applications to suppliers and product submissions."""

from alembic import op
import sqlalchemy as sa


revision = "20261122_0035"
down_revision = "20261122_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("checkout_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "maker_onboardings",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column(
            "application_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("maker_applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="invited"),
        sa.Column("invite_token_hash", sa.String(64), nullable=True),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invite_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("brand_story", sa.Text(), nullable=True),
        sa.Column("philosophy", sa.Text(), nullable=True),
        sa.Column("process", sa.Text(), nullable=True),
        sa.Column("specialties", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("product_categories", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("production_capacity", sa.Integer(), nullable=True),
        sa.Column("shipping_method", sa.String(500), nullable=True),
        sa.Column("shipping_responsibility", sa.String(80), nullable=True),
        sa.Column("return_policy", sa.Text(), nullable=True),
        sa.Column("exclusivity_terms", sa.Text(), nullable=True),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(as_uuid=True), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("brand_id", sa.Uuid(as_uuid=True), sa.ForeignKey("brands.id", ondelete="SET NULL"), nullable=True),
        sa.Column("supplier_id", sa.Uuid(as_uuid=True), sa.ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("supplier_invite_token_hash", sa.String(64), nullable=True),
        sa.Column("supplier_invite_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("supplier_invite_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("supplier_account_id", sa.Uuid(as_uuid=True), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('invited', 'in_progress', 'pending_review', 'approved', 'rejected')",
            name="ck_maker_onboardings_status",
        ),
        sa.UniqueConstraint("application_id", name="uq_maker_onboardings_application"),
        sa.UniqueConstraint("invite_token_hash", name="uq_maker_onboardings_invite_token_hash"),
        sa.UniqueConstraint("supplier_invite_token_hash", name="uq_maker_onboardings_supplier_invite_token_hash"),
    )
    op.create_index("ix_maker_onboardings_application_id", "maker_onboardings", ["application_id"])
    op.create_index("ix_maker_onboardings_status", "maker_onboardings", ["status"])

    op.create_table(
        "supplier_product_submissions",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("supplier_id", sa.Uuid(as_uuid=True), sa.ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("brand_id", sa.Uuid(as_uuid=True), sa.ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("category_id", sa.Uuid(as_uuid=True), sa.ForeignKey("product_categories.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("materials", sa.Text(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("cost_amount", sa.Integer(), nullable=False),
        sa.Column("production_capacity", sa.Integer(), nullable=False),
        sa.Column("minimum_order_quantity", sa.Integer(), nullable=False),
        sa.Column("lead_time_days", sa.Integer(), nullable=False),
        sa.Column("product_type", sa.String(100), nullable=True),
        sa.Column("size_tier", sa.String(40), nullable=True),
        sa.Column("dimensions", sa.String(80), nullable=True),
        sa.Column("image_paths", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("status", sa.String(20), nullable=False, server_default="submitted"),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("product_id", sa.Uuid(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(as_uuid=True), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('draft', 'submitted', 'approved', 'rejected', 'published')",
            name="ck_supplier_product_submissions_status",
        ),
        sa.CheckConstraint("cost_amount > 0", name="ck_supplier_product_submissions_cost"),
        sa.CheckConstraint("production_capacity >= 0", name="ck_supplier_product_submissions_capacity"),
        sa.CheckConstraint("minimum_order_quantity > 0", name="ck_supplier_product_submissions_minimum"),
        sa.CheckConstraint("lead_time_days >= 0", name="ck_supplier_product_submissions_lead_time"),
        sa.UniqueConstraint("product_id", name="uq_supplier_product_submissions_product"),
    )
    op.create_index("ix_supplier_product_submissions_supplier_id", "supplier_product_submissions", ["supplier_id"])
    op.create_index("ix_supplier_product_submissions_brand_id", "supplier_product_submissions", ["brand_id"])
    op.create_index("ix_supplier_product_submissions_category_id", "supplier_product_submissions", ["category_id"])
    op.create_index("ix_supplier_product_submissions_status", "supplier_product_submissions", ["status"])


def downgrade() -> None:
    op.drop_table("supplier_product_submissions")
    op.drop_table("maker_onboardings")
    op.drop_column("products", "checkout_enabled")
