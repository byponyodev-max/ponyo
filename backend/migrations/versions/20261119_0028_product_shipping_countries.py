"""Store confirmed shipping destinations per product."""

from alembic import op
import sqlalchemy as sa


revision = "20261119_0028"
down_revision = "20261119_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("shipping_countries", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "shipping_countries")
