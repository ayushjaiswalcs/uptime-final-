"""Enterprise features: new tables + columns on existing tables

Revision ID: 002
Revises: 001
Create Date: 2026-06-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def _col_exists(table, col):
    """Return True if column already exists (idempotent helper)."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return any(c["name"] == col for c in insp.get_columns(table))


def _table_exists(table):
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return table in insp.get_table_names()


def upgrade():
    # ── New columns on existing tables ─────────────────────────────────────
    if not _col_exists("users", "totp_secret"):
        op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    if not _col_exists("users", "totp_enabled"):
        op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=True, server_default="false"))
    if not _col_exists("users", "last_login_at"):
        op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    if not _col_exists("users", "avatar_url"):
        op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))

    if not _col_exists("monitors", "keyword"):
        op.add_column("monitors", sa.Column("keyword", sa.String(255), nullable=True))
    if not _col_exists("monitors", "dns_record_type"):
        op.add_column("monitors", sa.Column("dns_record_type", sa.String(10), nullable=True, server_default="A"))
    if not _col_exists("monitors", "failure_count"):
        op.add_column("monitors", sa.Column("failure_count", sa.Integer(), nullable=True, server_default="0"))
    if not _col_exists("monitors", "alert_threshold"):
        op.add_column("monitors", sa.Column("alert_threshold", sa.Integer(), nullable=True, server_default="1"))

    # ── New tables ──────────────────────────────────────────────────────────
    if not _table_exists("organizations"):
        op.create_table(
            "organizations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("slug", sa.String(100), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("logo_url", sa.String(500), nullable=True),
            sa.Column("plan", sa.String(50), nullable=True, server_default="free"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug"),
        )

    if not _table_exists("team_members"):
        op.create_table(
            "team_members",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("role", sa.String(50), nullable=True, server_default="developer"),
            sa.Column("invited_by", sa.Integer(), nullable=True),
            sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("api_keys"):
        op.create_table(
            "api_keys",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("key_prefix", sa.String(12), nullable=False),
            sa.Column("key_hash", sa.String(255), nullable=False),
            sa.Column("permissions", sa.Text(), nullable=True),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(100), nullable=False),
            sa.Column("resource_type", sa.String(50), nullable=True),
            sa.Column("resource_id", sa.Integer(), nullable=True),
            sa.Column("details", sa.Text(), nullable=True),
            sa.Column("ip_address", sa.String(50), nullable=True),
            sa.Column("user_agent", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("maintenance_windows"):
        op.create_table(
            "maintenance_windows",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("is_recurring", sa.Boolean(), nullable=True, server_default="false"),
            sa.Column("recurrence_cron", sa.String(100), nullable=True),
            sa.Column("affected_monitors", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("alert_rules"):
        op.create_table(
            "alert_rules",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("monitor_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("consecutive_failures", sa.Integer(), nullable=True, server_default="1"),
            sa.Column("recovery_confirmations", sa.Integer(), nullable=True, server_default="1"),
            sa.Column("silence_minutes", sa.Integer(), nullable=True, server_default="0"),
            sa.Column("escalation_after_minutes", sa.Integer(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["monitor_id"], ["monitors.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("webhook_endpoints"):
        op.create_table(
            "webhook_endpoints",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("url", sa.String(1000), nullable=False),
            sa.Column("secret", sa.String(255), nullable=True),
            sa.Column("events", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
            sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists("webhook_deliveries"):
        op.create_table(
            "webhook_deliveries",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("endpoint_id", sa.Integer(), nullable=False),
            sa.Column("event", sa.String(50), nullable=False),
            sa.Column("payload", sa.Text(), nullable=True),
            sa.Column("response_status", sa.Integer(), nullable=True),
            sa.Column("response_body", sa.Text(), nullable=True),
            sa.Column("success", sa.Boolean(), nullable=True, server_default="false"),
            sa.Column("delivered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["endpoint_id"], ["webhook_endpoints.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade():
    op.drop_table("webhook_deliveries")
    op.drop_table("webhook_endpoints")
    op.drop_table("alert_rules")
    op.drop_table("maintenance_windows")
    op.drop_table("audit_logs")
    op.drop_table("api_keys")
    op.drop_table("team_members")
    op.drop_table("organizations")

    for col in ["alert_threshold", "failure_count", "dns_record_type", "keyword"]:
        op.drop_column("monitors", col)
    for col in ["avatar_url", "last_login_at", "totp_enabled", "totp_secret"]:
        op.drop_column("users", col)
