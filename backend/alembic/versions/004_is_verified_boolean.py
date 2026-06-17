"""Convert users.is_verified from VARCHAR(10) to a real BOOLEAN

Revision ID: 004
Revises: 003
Create Date: 2026-06-16 00:00:00.000000

is_verified was stored as the strings 'true'/'false' in a VARCHAR(10) column,
which forced string comparisons in the auth code and was inconsistent with the
native BOOLEAN totp_enabled column. This migrates the column to a real BOOLEAN,
converting existing values. Dialect-aware so it works on both Postgres (live)
and SQLite (local dev).
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    dialect = op.get_bind().dialect.name
    if dialect == 'sqlite':
        # SQLite can't ALTER a column type in place; batch recreates the table.
        # Normalise the text values to 1/0 first so BOOLEAN affinity stores ints.
        op.execute("UPDATE users SET is_verified = CASE WHEN is_verified = 'true' THEN '1' ELSE '0' END")
        with op.batch_alter_table('users') as batch:
            batch.alter_column(
                'is_verified',
                existing_type=sa.String(length=10),
                type_=sa.Boolean(),
                existing_nullable=True,
                server_default=sa.text('0'),
            )
    else:
        # Guard against any stray values before the cast.
        op.execute("UPDATE users SET is_verified = 'false' WHERE is_verified IS NULL OR is_verified NOT IN ('true', 'false')")
        # The old VARCHAR default 'false' can't be auto-cast to boolean during the
        # type change, so drop it first; the new boolean default is set below.
        op.execute("ALTER TABLE users ALTER COLUMN is_verified DROP DEFAULT")
        op.alter_column(
            'users', 'is_verified',
            existing_type=sa.String(length=10),
            type_=sa.Boolean(),
            existing_nullable=True,
            postgresql_using='is_verified::boolean',
            server_default=sa.text('false'),
        )


def downgrade():
    dialect = op.get_bind().dialect.name
    if dialect == 'sqlite':
        with op.batch_alter_table('users') as batch:
            batch.alter_column(
                'is_verified',
                existing_type=sa.Boolean(),
                type_=sa.String(length=10),
                existing_nullable=True,
                server_default='false',
            )
        op.execute("UPDATE users SET is_verified = CASE WHEN is_verified IN ('1', 'true') THEN 'true' ELSE 'false' END")
    else:
        op.alter_column(
            'users', 'is_verified',
            existing_type=sa.Boolean(),
            type_=sa.String(length=10),
            existing_nullable=True,
            postgresql_using="CASE WHEN is_verified THEN 'true' ELSE 'false' END",
            server_default='false',
        )
