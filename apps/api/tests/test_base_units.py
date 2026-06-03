from __future__ import annotations

from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import DeclarativeBase, declared_attr

from app.db.base import Base


def test_base_inherits_declarative_base():
    assert issubclass(Base, DeclarativeBase)


def test_base_has_metadata():
    assert hasattr(Base, "metadata")
    assert Base.metadata is not None


def test_base_metadata_tables_empty_by_default():
    assert not Base.metadata.tables


def test_subclass_registers_table():
    class SampleModel(Base):
        __tablename__ = "sample"
        id = Column(Integer, primary_key=True)
        name = Column(String)

    assert "sample" in Base.metadata.tables
    table = Base.metadata.tables["sample"]
    assert table.name == "sample"
    assert "id" in table.columns
    assert "name" in table.columns


def test_base_registry_available():
    assert hasattr(Base, "registry")
    assert Base.registry is not None
