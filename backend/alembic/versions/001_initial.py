"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), nullable=True, server_default='owner'),
        sa.Column('subscription_plan', sa.String(50), nullable=True, server_default='free'),
        sa.Column('is_verified', sa.String(10), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_table(
        'monitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('monitor_name', sa.String(255), nullable=False),
        sa.Column('target_url', sa.Text(), nullable=False),
        sa.Column('monitor_type', sa.String(50), nullable=True, server_default='http'),
        sa.Column('interval', sa.Integer(), nullable=True, server_default='300'),
        sa.Column('timeout', sa.Integer(), nullable=True, server_default='10'),
        sa.Column('http_method', sa.String(10), nullable=True, server_default='GET'),
        sa.Column('expected_status_code', sa.Integer(), nullable=True, server_default='200'),
        sa.Column('custom_headers', sa.Text(), nullable=True),
        sa.Column('request_body', sa.Text(), nullable=True),
        sa.Column('current_status', sa.String(20), nullable=True, server_default='pending'),
        sa.Column('is_paused', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('uptime_percentage', sa.String(10), nullable=True, server_default='100.00'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'monitor_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('monitor_id', sa.Integer(), nullable=False),
        sa.Column('response_time', sa.Float(), nullable=True),
        sa.Column('http_status', sa.Integer(), nullable=True),
        sa.Column('is_up', sa.Boolean(), nullable=False),
        sa.Column('error_message', sa.String(500), nullable=True),
        sa.Column('checked_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['monitor_id'], ['monitors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'incidents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('monitor_id', sa.Integer(), nullable=False),
        sa.Column('outage_start_time', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('recovery_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('incident_status', sa.String(20), nullable=True, server_default='ongoing'),
        sa.ForeignKeyConstraint(['monitor_id'], ['monitors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('notification_type', sa.String(50), nullable=False),
        sa.Column('destination', sa.String(500), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'status_pages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('company_name', sa.String(255), nullable=False),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('custom_domain', sa.String(255), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )


def downgrade():
    op.drop_table('status_pages')
    op.drop_table('notifications')
    op.drop_table('incidents')
    op.drop_table('monitor_logs')
    op.drop_table('monitors')
    op.drop_table('users')
