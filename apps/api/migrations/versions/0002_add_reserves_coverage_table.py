"""add reserves coverage table

Revision ID: add_reserves_coverage_table
Revises: 0001_initial_schema
Create Date: 2026-04-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "add_reserves_coverage_table"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reserves_coverage",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("country_iso", sa.String(length=8), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stock_days", sa.Float(), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reserves_coverage_country_iso", "reserves_coverage", ["country_iso"], unique=False)
    op.create_index("ix_reserves_coverage_timestamp", "reserves_coverage", ["timestamp"], unique=False)
    op.execute(
        sa.text(
            "CREATE INDEX ix_reserves_coverage_country_iso_timestamp "
            "ON reserves_coverage (country_iso, timestamp DESC)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX ix_reserves_coverage_country_iso_timestamp"))
    op.drop_index("ix_reserves_coverage_timestamp", table_name="reserves_coverage")
    op.drop_index("ix_reserves_coverage_country_iso", table_name="reserves_coverage")
    op.drop_table("reserves_coverage")
