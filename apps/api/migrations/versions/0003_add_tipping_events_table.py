"""add tipping events table

Revision ID: add_tipping_events_table
Revises: add_reserves_coverage_table
Create Date: 2026-04-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "add_tipping_events_table"
down_revision = "add_reserves_coverage_table"
branch_labels = None
depends_on = None


event_type_enum = sa.Enum("ALERT", "CRITICAL", "CROSSOVER", name="tipping_event_type", native_enum=False, create_constraint=True)


def upgrade() -> None:
    op.create_table(
        "tipping_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_type", event_type_enum, nullable=False),
        sa.Column("gap_usd_per_litre", sa.Float(), nullable=False),
        sa.Column("fossil_price", sa.Float(), nullable=False),
        sa.Column("saf_effective_price", sa.Float(), nullable=False),
        sa.Column("saf_pathway", sa.String(length=120), nullable=False),
        sa.Column("triggered_by", sa.String(length=120), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tipping_events_timestamp", "tipping_events", ["timestamp"], unique=False)
    op.execute(
        sa.text(
            "CREATE INDEX ix_tipping_events_event_type_timestamp "
            "ON tipping_events (event_type, timestamp DESC)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX ix_tipping_events_event_type_timestamp"))
    op.drop_index("ix_tipping_events_timestamp", table_name="tipping_events")
    op.drop_table("tipping_events")
