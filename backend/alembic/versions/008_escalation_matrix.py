"""Escalation matrix tables + incident run-state columns

Revision ID: 008
Revises: 007
"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'escalation_configs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('monitor_id', sa.Integer(), sa.ForeignKey('monitors.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='NORMAL'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_escalation_configs_user_sev', 'escalation_configs', ['user_id', 'severity', 'is_active'])
    op.create_index('ix_escalation_configs_monitor', 'escalation_configs', ['monitor_id'])

    op.create_table(
        'escalation_levels',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('config_id', sa.Integer(), sa.ForeignKey('escalation_configs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('level_number', sa.Integer(), nullable=False),
        sa.Column('escalation_name', sa.String(255), nullable=False),
        sa.Column('timer_minutes', sa.Integer(), nullable=True),
        sa.Column('notify_target', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('config_id', 'level_number', name='uq_level_config_number'),
    )
    op.create_index('ix_escalation_levels_config', 'escalation_levels', ['config_id'])

    op.create_table(
        'escalation_channels',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('level_id', sa.Integer(), sa.ForeignKey('escalation_levels.id', ondelete='CASCADE'), nullable=False),
        sa.Column('channel', sa.String(20), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint('level_id', 'channel', name='uq_channel_level_name'),
    )
    op.create_index('ix_escalation_channels_level', 'escalation_channels', ['level_id'])

    op.create_table(
        'escalation_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('incident_id', sa.Integer(), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('monitor_id', sa.Integer(), sa.ForeignKey('monitors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('config_id', sa.Integer(), sa.ForeignKey('escalation_configs.id', ondelete='SET NULL'), nullable=True),
        sa.Column('level_id', sa.Integer(), sa.ForeignKey('escalation_levels.id', ondelete='SET NULL'), nullable=True),
        sa.Column('event_type', sa.String(40), nullable=False),
        sa.Column('severity', sa.String(20), nullable=True),
        sa.Column('level_number', sa.Integer(), nullable=True),
        sa.Column('channel', sa.String(20), nullable=True),
        sa.Column('target', sa.String(255), nullable=True),
        sa.Column('status', sa.String(20), nullable=True, server_default='info'),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_escalation_history_incident', 'escalation_history', ['incident_id', 'created_at'])
    op.create_index('ix_escalation_history_user_event', 'escalation_history', ['user_id', 'event_type'])
    op.create_index('ix_escalation_history_created', 'escalation_history', ['created_at'])

    # Incident escalation run-state
    op.add_column('incidents', sa.Column('escalation_config_id', sa.Integer(),
                  sa.ForeignKey('escalation_configs.id', ondelete='SET NULL'), nullable=True))
    op.add_column('incidents', sa.Column('escalation_level', sa.Integer(), server_default='0'))
    op.add_column('incidents', sa.Column('escalation_active', sa.Boolean(), server_default=sa.false()))
    op.add_column('incidents', sa.Column('next_escalation_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('incidents', 'next_escalation_at')
    op.drop_column('incidents', 'escalation_active')
    op.drop_column('incidents', 'escalation_level')
    op.drop_column('incidents', 'escalation_config_id')
    op.drop_table('escalation_history')
    op.drop_table('escalation_channels')
    op.drop_table('escalation_levels')
    op.drop_table('escalation_configs')
