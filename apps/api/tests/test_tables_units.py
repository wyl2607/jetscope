from uuid import UUID

from sqlalchemy import CheckConstraint

from app.models.tables import AIResearchBudgetDay, ESGSignal, ReservesCoverage, TippingEvent, Workspace


def test_workspace_id_uses_uuid4_callable_default() -> None:
    id_column = Workspace.__table__.c.id

    assert id_column.type.length == 36
    assert callable(id_column.default.arg)

    generated = id_column.default.arg(None)
    assert isinstance(generated, str)
    assert str(UUID(generated)) == generated


def test_tipping_event_metadata_and_enum_constraints() -> None:
    table = TippingEvent.__table__

    assert "metadata" in table.c
    assert "metadata_" not in table.c
    assert TippingEvent.__mapper__.attrs["metadata_"].columns[0].name == "metadata"

    enum_type = table.c.event_type.type
    assert enum_type.enums == ["ALERT", "CRITICAL", "CROSSOVER"]
    assert enum_type.native_enum is False
    assert enum_type.create_constraint is True

    constraint_names = {c.name for c in table.constraints if isinstance(c, CheckConstraint)}
    assert "tipping_event_type" in constraint_names


def test_reserves_coverage_has_desc_timestamp_index() -> None:
    table = ReservesCoverage.__table__
    index = next(i for i in table.indexes if i.name == "ix_reserves_coverage_country_iso_timestamp")

    expressions = [str(expr) for expr in index.expressions]
    assert expressions == ["reserves_coverage.country_iso", "reserves_coverage.timestamp DESC"]


def test_esg_signal_and_budget_defaults_are_declared() -> None:
    esg_table = ESGSignal.__table__
    budget_table = AIResearchBudgetDay.__table__

    assert esg_table.c.source_url.unique is True
    assert esg_table.c.source_url.index is True

    assert budget_table.c.tokens_used.default.arg == 0
    assert budget_table.c.exhausted.default.arg is False
