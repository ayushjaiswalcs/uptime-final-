"""Add escalation_config_id to monitors

Revision ID: 010
Revises: 009
"""
from alembic import op
import sqlalchemy as sa

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'monitors',
        sa.Column(
            'escalation_config_id',
            sa.Integer(),
            sa.ForeignKey('escalation_configs.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.create_index('ix_monitors_escalation_config', 'monitors', ['escalation_config_id'])


def downgrade():
    op.drop_index('ix_monitors_escalation_config', table_name='monitors')
    op.drop_column('monitors', 'escalation_config_id')
