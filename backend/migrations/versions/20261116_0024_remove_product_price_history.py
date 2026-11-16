"""Remove product price history permanently."""

from alembic import op
import sqlalchemy as sa

revision = "20261116_0024"
down_revision = "20261111_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("products", "price_history")


def downgrade() -> None:
    op.add_column(
        "products",
        sa.Column("price_history", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.alter_column("products", "price_history", server_default=None)
