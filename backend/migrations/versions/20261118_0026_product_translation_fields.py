"""Cache translated storefront product fields."""

from alembic import op
import sqlalchemy as sa


revision = "20261118_0026"
down_revision = "20261117_0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "product_translations",
        sa.Column("fields", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("product_translations", "fields")
