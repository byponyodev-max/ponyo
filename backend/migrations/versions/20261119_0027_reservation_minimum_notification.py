"""Track when a product reaches its reservation minimum."""

from alembic import op
import sqlalchemy as sa


revision = "20261119_0027"
down_revision = "20261118_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("reservation_minimum_reached_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE products
            SET reservation_minimum_reached_at = CURRENT_TIMESTAMP
            WHERE reservation_target IS NOT NULL
              AND (
                  SELECT COUNT(*)
                  FROM product_reservations
                  WHERE product_reservations.product_id = products.id
              ) >= reservation_target
            """
        )
    )


def downgrade() -> None:
    op.drop_column("products", "reservation_minimum_reached_at")
