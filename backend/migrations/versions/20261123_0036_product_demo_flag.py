"""Mark the current catalog as demo data for safe future cleanup."""

from alembic import op
import sqlalchemy as sa


revision = "20261123_0036"
down_revision = "20261122_0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(sa.text("UPDATE products SET is_demo = TRUE"))
    op.create_index("ix_products_is_demo", "products", ["is_demo"])


def downgrade() -> None:
    op.drop_index("ix_products_is_demo", table_name="products")
    op.drop_column("products", "is_demo")
