"""generalize esg signal taxonomy to energy transition

Revision ID: generalize_signal_taxonomy
Revises: add_esg_signals_table
Create Date: 2026-06-04

Widens signal_type with energy/grid categories and rebrands the
SAF-specific impact direction (BULLISH_SAF/BEARISH_SAF) to a
domain-neutral BULLISH/BEARISH for the clean-energy transition.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "generalize_signal_taxonomy"
down_revision = "add_esg_signals_table"
branch_labels = None
depends_on = None


old_signal_type_enum = sa.Enum(
    "SUPPLY_DISRUPTION",
    "POLICY_CHANGE",
    "PRICE_SHOCK",
    "CAPACITY_ANNOUNCEMENT",
    "OTHER",
    name="esg_signal_type",
    native_enum=False,
    create_constraint=True,
)
new_signal_type_enum = sa.Enum(
    "SUPPLY_DISRUPTION",
    "POLICY_CHANGE",
    "PRICE_SHOCK",
    "CAPACITY_ANNOUNCEMENT",
    "TECHNOLOGY_BREAKTHROUGH",
    "GRID_INFRASTRUCTURE",
    "OTHER",
    name="esg_signal_type",
    native_enum=False,
    create_constraint=True,
)

old_impact_enum = sa.Enum(
    "BEARISH_SAF",
    "BULLISH_SAF",
    "NEUTRAL",
    name="esg_impact_direction",
    native_enum=False,
    create_constraint=True,
)
new_impact_enum = sa.Enum(
    "BEARISH",
    "BULLISH",
    "NEUTRAL",
    name="esg_impact_direction",
    native_enum=False,
    create_constraint=True,
)

SIGNAL_TYPE_INDEX = "ix_esg_signals_signal_type_created_at"


def upgrade() -> None:
    # Drop the custom DESC index so the batch table-recreate does not
    # reflect and duplicate it, then rebuild it at the end.
    op.execute(sa.text(f"DROP INDEX {SIGNAL_TYPE_INDEX}"))

    # Step 1: widen signal_type and relax impact_direction to a plain
    # string so legacy SAF values can be remapped without violating a
    # CHECK constraint.
    with op.batch_alter_table("esg_signals", recreate="always") as batch_op:
        batch_op.alter_column(
            "signal_type",
            existing_type=old_signal_type_enum,
            type_=new_signal_type_enum,
        )
        batch_op.alter_column(
            "impact_direction",
            existing_type=old_impact_enum,
            type_=sa.String(length=20),
        )

    op.execute(
        sa.text("UPDATE esg_signals SET impact_direction = 'BULLISH' WHERE impact_direction = 'BULLISH_SAF'")
    )
    op.execute(
        sa.text("UPDATE esg_signals SET impact_direction = 'BEARISH' WHERE impact_direction = 'BEARISH_SAF'")
    )

    # Step 2: pin impact_direction to the domain-neutral enum.
    with op.batch_alter_table("esg_signals", recreate="always") as batch_op:
        batch_op.alter_column(
            "impact_direction",
            existing_type=sa.String(length=20),
            type_=new_impact_enum,
        )

    op.execute(
        sa.text(
            f"CREATE INDEX {SIGNAL_TYPE_INDEX} "
            "ON esg_signals (signal_type, created_at DESC)"
        )
    )


def downgrade() -> None:
    op.execute(sa.text(f"DROP INDEX {SIGNAL_TYPE_INDEX}"))

    # Collapse the energy/grid categories the old taxonomy cannot express
    # before narrowing the CHECK constraint.
    op.execute(
        sa.text(
            "UPDATE esg_signals SET signal_type = 'OTHER' "
            "WHERE signal_type IN ('TECHNOLOGY_BREAKTHROUGH', 'GRID_INFRASTRUCTURE')"
        )
    )

    with op.batch_alter_table("esg_signals", recreate="always") as batch_op:
        batch_op.alter_column(
            "signal_type",
            existing_type=new_signal_type_enum,
            type_=old_signal_type_enum,
        )
        batch_op.alter_column(
            "impact_direction",
            existing_type=new_impact_enum,
            type_=sa.String(length=20),
        )

    op.execute(
        sa.text("UPDATE esg_signals SET impact_direction = 'BULLISH_SAF' WHERE impact_direction = 'BULLISH'")
    )
    op.execute(
        sa.text("UPDATE esg_signals SET impact_direction = 'BEARISH_SAF' WHERE impact_direction = 'BEARISH'")
    )

    with op.batch_alter_table("esg_signals", recreate="always") as batch_op:
        batch_op.alter_column(
            "impact_direction",
            existing_type=sa.String(length=20),
            type_=old_impact_enum,
        )

    op.execute(
        sa.text(
            f"CREATE INDEX {SIGNAL_TYPE_INDEX} "
            "ON esg_signals (signal_type, created_at DESC)"
        )
    )
