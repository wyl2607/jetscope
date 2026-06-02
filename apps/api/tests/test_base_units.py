from __future__ import annotations

from sqlalchemy import Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.db.base import Base


def test_base_is_sqlalchemy_declarative_base():
    assert issubclass(Base, DeclarativeBase)
    assert Base.metadata is Base.registry.metadata
    assert Base.registry.constructor is not None


def test_base_registers_declared_model_table_metadata():
    class UnitBaseModel(Base):
        __tablename__ = "unit_base_models"

        id: Mapped[int] = mapped_column(Integer, primary_key=True)
        name: Mapped[str] = mapped_column(String(40), nullable=False)

    table = UnitBaseModel.__table__

    assert table is Base.metadata.tables["unit_base_models"]
    assert table.c.id.primary_key is True
    assert table.c.name.nullable is False
    assert table.c.name.type.length == 40


def test_base_mapped_model_instances_use_keyword_constructor():
    class UnitConstructedModel(Base):
        __tablename__ = "unit_constructed_models"

        id: Mapped[int] = mapped_column(Integer, primary_key=True)
        label: Mapped[str] = mapped_column(String(20))

    instance = UnitConstructedModel(id=7, label="offline")

    assert instance.id == 7
    assert instance.label == "offline"
    assert UnitConstructedModel.__mapper__.local_table.name == "unit_constructed_models"
