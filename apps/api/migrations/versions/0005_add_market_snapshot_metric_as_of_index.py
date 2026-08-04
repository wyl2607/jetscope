"""add composite index for latest market snapshot reads

Revision ID: 0005_market_snapshot_metric_as_of
Revises: add_esg_signals_table
Create Date: 2026-08-04
"""

from __future__ import annotations

from alembic import op


revision = "0005_market_snapshot_metric_as_of"
down_revision = "generalize_signal_taxonomy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_market_snapshots_metric_key_as_of",
        "market_snapshots",
        ["metric_key", "as_of"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_market_snapshots_metric_key_as_of", table_name="market_snapshots")
