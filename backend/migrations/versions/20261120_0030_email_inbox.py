"""Persist mailbox messages and IMAP sync cursor."""

from alembic import op
import sqlalchemy as sa


revision = "20261120_0030"
down_revision = "20261119_0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_inbox_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("thread_key", sa.String(length=180), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("source_key", sa.String(length=255), nullable=False),
        sa.Column("direction", sa.String(length=16), nullable=False),
        sa.Column("from_email", sa.String(length=320), nullable=False),
        sa.Column("from_name", sa.String(length=180), nullable=False),
        sa.Column("to_email", sa.String(length=320), nullable=False),
        sa.Column("subject", sa.String(length=998), nullable=False),
        sa.Column("text_body", sa.Text(), nullable=False),
        sa.Column("message_id", sa.String(length=998), nullable=True),
        sa.Column("in_reply_to", sa.String(length=998), nullable=True),
        sa.Column("references_header", sa.Text(), nullable=True),
        sa.Column("mailbox_name", sa.String(length=255), nullable=True),
        sa.Column("uid_validity", sa.String(length=32), nullable=True),
        sa.Column("uid", sa.Integer(), nullable=True),
        sa.Column("is_read", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("delivery_status", sa.String(length=24), server_default="received", nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_type", "source_key", name="uq_email_inbox_source"),
        sa.UniqueConstraint("mailbox_name", "uid_validity", "uid", name="uq_email_inbox_mailbox_uid"),
    )
    op.create_index("ix_email_inbox_messages_thread_key", "email_inbox_messages", ["thread_key"])
    op.create_index("ix_email_inbox_messages_source_type", "email_inbox_messages", ["source_type"])
    op.create_index("ix_email_inbox_messages_message_id", "email_inbox_messages", ["message_id"])
    op.create_index("ix_email_inbox_messages_received_at", "email_inbox_messages", ["received_at"])
    op.create_table(
        "email_inbox_sync_state",
        sa.Column("mailbox_name", sa.String(length=255), nullable=False),
        sa.Column("uid_validity", sa.String(length=32), nullable=True),
        sa.Column("last_uid", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=80), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("mailbox_name"),
    )


def downgrade() -> None:
    op.drop_table("email_inbox_sync_state")
    op.drop_index("ix_email_inbox_messages_received_at", table_name="email_inbox_messages")
    op.drop_index("ix_email_inbox_messages_message_id", table_name="email_inbox_messages")
    op.drop_index("ix_email_inbox_messages_source_type", table_name="email_inbox_messages")
    op.drop_index("ix_email_inbox_messages_thread_key", table_name="email_inbox_messages")
    op.drop_table("email_inbox_messages")
