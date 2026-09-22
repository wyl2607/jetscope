"""backfill quality onto legacy market snapshot rows

Revision ID: 0007_legacy_snapshot_quality
Revises: 0006_market_snapshot_latest_cover
Create Date: 2026-09-14

Production-shaped rows often stored only refresh_run_id. Recover quality from
the linked refresh run when possible; otherwise mark unknown. History is never
deleted.
"""

from __future__ import annotations

from alembic import op
from sqlalchemy.orm import Session


revision = "0007_legacy_snapshot_quality"
down_revision = "0006_market_snapshot_latest_cover"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    session = Session(bind=bind)
    try:
        from app.services.market_quality import backfill_legacy_market_snapshots

        backfill_legacy_market_snapshots(session)
        session.commit()
    finally:
        session.close()


def downgrade() -> None:
    # Quality annotations are additive. Do not strip recovered evidence.
    return
