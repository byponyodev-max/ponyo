"""Track when supplier records are added for Admin activity notifications."""

from alembic import op
import sqlalchemy as sa


revision = "20261120_0031"
down_revision = "20261120_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "suppliers",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_suppliers_created_at", "suppliers", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_suppliers_created_at", table_name="suppliers")
    op.drop_column("suppliers", "created_at")
