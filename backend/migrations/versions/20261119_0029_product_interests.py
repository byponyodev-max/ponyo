"""Store unshipped product interest separately from reservations."""

from alembic import op
import sqlalchemy as sa


revision = "20261119_0029"
down_revision = "20261119_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_interests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("country", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "product_id",
            "email",
            "country",
            name="uq_product_interests_product_email_country",
        ),
    )
    op.create_index("ix_product_interests_product_id", "product_interests", ["product_id"])
    op.create_index("ix_product_interests_email", "product_interests", ["email"])
    op.create_index("ix_product_interests_country", "product_interests", ["country"])


def downgrade() -> None:
    op.drop_index("ix_product_interests_country", table_name="product_interests")
    op.drop_index("ix_product_interests_email", table_name="product_interests")
    op.drop_index("ix_product_interests_product_id", table_name="product_interests")
    op.drop_table("product_interests")
