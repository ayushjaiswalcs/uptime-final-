"""Add ping metrics columns to monitor_logs

Revision ID: 007
Revises: 006
"""
from alembic import op
import sqlalchemy as sa

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade():
    dialect = op.get_context().dialect.name
    if dialect == 'sqlite':
        with op.batch_alter_table('monitor_logs') as batch_op:
            batch_op.add_column(sa.Column('packet_loss', sa.Float(), nullable=True))
            batch_op.add_column(sa.Column('ping_min_ms', sa.Float(), nullable=True))
            batch_op.add_column(sa.Column('ping_max_ms', sa.Float(), nullable=True))
    else:
        op.add_column('monitor_logs', sa.Column('packet_loss', sa.Float(), nullable=True))
        op.add_column('monitor_logs', sa.Column('ping_min_ms', sa.Float(), nullable=True))
        op.add_column('monitor_logs', sa.Column('ping_max_ms', sa.Float(), nullable=True))


def downgrade():
    dialect = op.get_context().dialect.name
    if dialect == 'sqlite':
        with op.batch_alter_table('monitor_logs') as batch_op:
            batch_op.drop_column('ping_max_ms')
            batch_op.drop_column('ping_min_ms')
            batch_op.drop_column('packet_loss')
    else:
        op.drop_column('monitor_logs', 'ping_max_ms')
        op.drop_column('monitor_logs', 'ping_min_ms')
        op.drop_column('monitor_logs', 'packet_loss')
