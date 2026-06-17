"""Add teams, projects, project_members, team_memberships, comments; extend monitors and incidents

Revision ID: 006
Revises: 005
Create Date: 2026-06-17 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    dialect = op.get_bind().dialect.name

    # ── teams ──────────────────────────────────────────────────────────────────
    op.create_table(
        'teams',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('lead_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('color', sa.String(20), nullable=True, server_default='#4F46E5'),
        sa.Column('status', sa.String(20), nullable=True, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── team_memberships ────────────────────────────────────────────────────────
    op.create_table(
        'team_memberships',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(50), nullable=True, server_default='developer'),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── projects ────────────────────────────────────────────────────────────────
    op.create_table(
        'projects',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=True, server_default='active'),
        sa.Column('priority', sa.String(20), nullable=True, server_default='medium'),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── project_members ─────────────────────────────────────────────────────────
    op.create_table(
        'project_members',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(50), nullable=True, server_default='developer'),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── comments ────────────────────────────────────────────────────────────────
    op.create_table(
        'comments',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('monitor_id', sa.Integer(), sa.ForeignKey('monitors.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── monitors: add team_id and project_id ────────────────────────────────────
    if dialect == 'sqlite':
        with op.batch_alter_table('monitors') as batch:
            batch.add_column(sa.Column('team_id', sa.Integer(), nullable=True))
            batch.add_column(sa.Column('project_id', sa.Integer(), nullable=True))
            batch.create_foreign_key('fk_monitors_team_id', 'teams', ['team_id'], ['id'])
            batch.create_foreign_key('fk_monitors_project_id', 'projects', ['project_id'], ['id'])
    else:
        op.add_column('monitors', sa.Column('team_id', sa.Integer(), nullable=True))
        op.add_column('monitors', sa.Column('project_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_monitors_team_id', 'monitors', 'teams', ['team_id'], ['id'], ondelete='SET NULL')
        op.create_foreign_key('fk_monitors_project_id', 'monitors', 'projects', ['project_id'], ['id'], ondelete='SET NULL')

    # ── incidents: add severity, assignment, root_cause, title ──────────────────
    if dialect == 'sqlite':
        with op.batch_alter_table('incidents') as batch:
            batch.add_column(sa.Column('severity', sa.String(20), nullable=True, server_default='medium'))
            batch.add_column(sa.Column('assigned_team_id', sa.Integer(), nullable=True))
            batch.add_column(sa.Column('assigned_user_id', sa.Integer(), nullable=True))
            batch.add_column(sa.Column('root_cause', sa.Text(), nullable=True))
            batch.add_column(sa.Column('title', sa.String(255), nullable=True))
            batch.create_foreign_key('fk_incidents_assigned_team', 'teams', ['assigned_team_id'], ['id'])
            batch.create_foreign_key('fk_incidents_assigned_user', 'users', ['assigned_user_id'], ['id'])
    else:
        op.add_column('incidents', sa.Column('severity', sa.String(20), nullable=True, server_default='medium'))
        op.add_column('incidents', sa.Column('assigned_team_id', sa.Integer(), nullable=True))
        op.add_column('incidents', sa.Column('assigned_user_id', sa.Integer(), nullable=True))
        op.add_column('incidents', sa.Column('root_cause', sa.Text(), nullable=True))
        op.add_column('incidents', sa.Column('title', sa.String(255), nullable=True))
        op.create_foreign_key('fk_incidents_assigned_team', 'incidents', 'teams', ['assigned_team_id'], ['id'], ondelete='SET NULL')
        op.create_foreign_key('fk_incidents_assigned_user', 'incidents', 'users', ['assigned_user_id'], ['id'], ondelete='SET NULL')


def downgrade():
    dialect = op.get_bind().dialect.name

    if dialect == 'sqlite':
        with op.batch_alter_table('incidents') as batch:
            batch.drop_constraint('fk_incidents_assigned_team', type_='foreignkey')
            batch.drop_constraint('fk_incidents_assigned_user', type_='foreignkey')
            batch.drop_column('severity')
            batch.drop_column('assigned_team_id')
            batch.drop_column('assigned_user_id')
            batch.drop_column('root_cause')
            batch.drop_column('title')
        with op.batch_alter_table('monitors') as batch:
            batch.drop_constraint('fk_monitors_team_id', type_='foreignkey')
            batch.drop_constraint('fk_monitors_project_id', type_='foreignkey')
            batch.drop_column('team_id')
            batch.drop_column('project_id')
    else:
        op.drop_constraint('fk_incidents_assigned_team', 'incidents', type_='foreignkey')
        op.drop_constraint('fk_incidents_assigned_user', 'incidents', type_='foreignkey')
        op.drop_column('incidents', 'severity')
        op.drop_column('incidents', 'assigned_team_id')
        op.drop_column('incidents', 'assigned_user_id')
        op.drop_column('incidents', 'root_cause')
        op.drop_column('incidents', 'title')
        op.drop_constraint('fk_monitors_team_id', 'monitors', type_='foreignkey')
        op.drop_constraint('fk_monitors_project_id', 'monitors', type_='foreignkey')
        op.drop_column('monitors', 'team_id')
        op.drop_column('monitors', 'project_id')

    op.drop_table('comments')
    op.drop_table('project_members')
    op.drop_table('projects')
    op.drop_table('team_memberships')
    op.drop_table('teams')
