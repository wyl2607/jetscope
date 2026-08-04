"""extend the latest market snapshot index with deterministic tie-break ordering

Revision ID: 0006_market_snapshot_latest_cover
Revises: 0005_market_snapshot_metric_as_of
Create Date: 2026-08-04
"""

from __future__ import annotations

from alembic import op


revision = "0006_market_snapshot_latest_cover"
down_revision = "0005_market_snapshot_metric_as_of"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_market_snapshots_metric_key_as_of", table_name="market_snapshots")
    op.create_index(
        "ix_market_snapshots_metric_key_as_of",
        "market_snapshots",
        ["metric_key", "as_of", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_market_snapshots_metric_key_as_of", table_name="market_snapshots")
    op.create_index(
        "ix_market_snapshots_metric_key_as_of",
        "market_snapshots",
        ["metric_key", "as_of"],
        unique=False,
    )
