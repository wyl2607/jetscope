"""initial schema

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-04-18
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workspaces_slug", "workspaces", ["slug"], unique=True)

    op.create_table(
        "workspace_preferences",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("preferences", sa.JSON(), nullable=False),
        sa.Column("route_edits", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("workspace_id"),
    )

    op.create_table(
        "scenarios",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("preferences", sa.JSON(), nullable=False),
        sa.Column("route_edits", sa.JSON(), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scenarios_workspace_id", "scenarios", ["workspace_id"], unique=False)

    op.create_table(
        "market_refresh_runs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_status", sa.String(length=24), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=False),
        sa.Column("ingest", sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_market_refresh_runs_refreshed_at", "market_refresh_runs", ["refreshed_at"], unique=False)
    op.create_index("ix_market_refresh_runs_source_status", "market_refresh_runs", ["source_status"], unique=False)

    op.create_table(
        "market_snapshots",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("source_key", sa.String(length=80), nullable=False),
        sa.Column("metric_key", sa.String(length=80), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("as_of", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_market_snapshots_source_key", "market_snapshots", ["source_key"], unique=False)
    op.create_index("ix_market_snapshots_metric_key", "market_snapshots", ["metric_key"], unique=False)

    op.create_table(
        "route_catalog",
        sa.Column("pathway_id", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("pathway", sa.Text(), nullable=False),
        sa.Column("base_cost_usd_per_l", sa.Float(), nullable=False),
        sa.Column("co2_savings_kg_per_l", sa.Float(), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.PrimaryKeyConstraint("pathway_id"),
    )

    op.create_table(
        "refuel_eu_targets",
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("saf_share_pct", sa.Float(), nullable=False),
        sa.Column("synthetic_share_pct", sa.Float(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.PrimaryKeyConstraint("year"),
    )


def downgrade() -> None:
    op.drop_table("refuel_eu_targets")
    op.drop_table("route_catalog")

    op.drop_index("ix_market_snapshots_metric_key", table_name="market_snapshots")
    op.drop_index("ix_market_snapshots_source_key", table_name="market_snapshots")
    op.drop_table("market_snapshots")

    op.drop_index("ix_market_refresh_runs_source_status", table_name="market_refresh_runs")
    op.drop_index("ix_market_refresh_runs_refreshed_at", table_name="market_refresh_runs")
    op.drop_table("market_refresh_runs")

    op.drop_index("ix_scenarios_workspace_id", table_name="scenarios")
    op.drop_table("scenarios")

    op.drop_table("workspace_preferences")

    op.drop_index("ix_workspaces_slug", table_name="workspaces")
    op.drop_table("workspaces")
