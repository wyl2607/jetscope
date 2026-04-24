"""add esg signals table

Revision ID: add_esg_signals_table
Revises: add_tipping_events_table
Create Date: 2026-04-24
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "add_esg_signals_table"
down_revision = "add_tipping_events_table"
branch_labels = None
depends_on = None


signal_type_enum = sa.Enum(
    "SUPPLY_DISRUPTION",
    "POLICY_CHANGE",
    "PRICE_SHOCK",
    "CAPACITY_ANNOUNCEMENT",
    "OTHER",
    name="esg_signal_type",
    native_enum=False,
    create_constraint=True,
)

impact_direction_enum = sa.Enum(
    "BEARISH_SAF",
    "BULLISH_SAF",
    "NEUTRAL",
    name="esg_impact_direction",
    native_enum=False,
    create_constraint=True,
)


def upgrade() -> None:
    op.create_table(
        "esg_signals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_url", sa.String(length=1024), nullable=False),
        sa.Column("signal_type", signal_type_enum, nullable=False),
        sa.Column("entities", sa.JSON(), nullable=False),
        sa.Column("impact_direction", impact_direction_enum, nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("summary_en", sa.Text(), nullable=False),
        sa.Column("summary_cn", sa.Text(), nullable=False),
        sa.Column("raw_title", sa.String(length=512), nullable=False),
        sa.Column("raw_excerpt", sa.Text(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claude_model", sa.String(length=120), nullable=False),
        sa.Column("prompt_cache_hit", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_url"),
        sa.CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_esg_signals_confidence_range"),
    )
    op.create_index("ix_esg_signals_created_at", "esg_signals", ["created_at"], unique=False)
    op.create_index("ix_esg_signals_source_url", "esg_signals", ["source_url"], unique=True)
    op.execute(
        sa.text(
            "CREATE INDEX ix_esg_signals_signal_type_created_at "
            "ON esg_signals (signal_type, created_at DESC)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX ix_esg_signals_signal_type_created_at"))
    op.drop_index("ix_esg_signals_source_url", table_name="esg_signals")
    op.drop_index("ix_esg_signals_created_at", table_name="esg_signals")
    op.drop_table("esg_signals")
