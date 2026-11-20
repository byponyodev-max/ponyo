"""Allow Admin to archive email conversations without deleting messages."""

from alembic import op
import sqlalchemy as sa


revision = "20261120_0032"
down_revision = "20261120_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_inbox_messages",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_email_inbox_messages_archived_at",
        "email_inbox_messages",
        ["archived_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_inbox_messages_archived_at", table_name="email_inbox_messages")
    op.drop_column("email_inbox_messages", "archived_at")
