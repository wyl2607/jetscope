from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
ADAPTERS_ROOT = REPO_ROOT / "apps" / "api" / "adapters"
if str(ADAPTERS_ROOT) not in sys.path:
    sys.path.insert(0, str(ADAPTERS_ROOT))

import easa as easa_module
from easa import EASAReportParser


@dataclass
class FakePage:
    text: str
    tables: list[list[list[Any]]] | None = None

    def extract_text(self) -> str:
        return self.text

    def extract_tables(self) -> list[list[list[Any]]]:
        return self.tables or []


class FakePDF:
    def __init__(self, pages: list[FakePage], metadata: dict[str, Any] | None = None):
        self.pages = pages
        self.metadata = metadata or {}

    def __enter__(self) -> "FakePDF":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


def test_easa_parse_missing_dependency_returns_unavailable(monkeypatch, tmp_path):
    monkeypatch.setattr(easa_module.pdfplumber, "open", None)

    result = EASAReportParser(tmp_path / "easa_report.pdf").parse()

    assert result["eu_saf_capacity_mt"] is None
    assert result["source_status"]["status"] == "unavailable"
    assert result["source_status"]["error_code"] == "MISSING_DEPENDENCY"
    assert result["source_status"]["confidence"] == 0.0
    assert set(result["source_status"]["missing_fields"]) == {
        "eu_saf_capacity_mt",
        "hefa_share_pct",
        "refueleu_mandate_progress_pct",
        "report_period",
        "published_at",
    }


def test_easa_parse_healthy_extracts_all_fields(monkeypatch, tmp_path):
    fake_pdf = FakePDF(
        pages=[
            FakePage(
                text=(
                    "EASA quarterly report Q2 2025\n"
                    "EU SAF capacity reached 11.2 million tonnes.\n"
                    "HEFA share is 57%.\n"
                    "ReFuelEU mandate progress 22.5%."
                ),
                tables=[[["Published", "18 January 2026"]]],
            )
        ],
        metadata={"CreationDate": "D:20260118120000Z"},
    )
    monkeypatch.setattr(easa_module.pdfplumber, "open", lambda _: fake_pdf)

    result = EASAReportParser(tmp_path / "any_layout.pdf").parse()

    assert result["eu_saf_capacity_mt"] == 11.2
    assert result["hefa_share_pct"] == 57.0
    assert result["refueleu_mandate_progress_pct"] == 22.5
    assert result["report_period"] == "2025-Q2"
    assert result["published_at"] == "2026-01-18"
    assert result["source_status"]["status"] == "healthy"
    assert result["source_status"]["error_code"] is None
    assert result["source_status"]["confidence"] == 0.97


def test_easa_parse_partial_layout_still_returns_degraded(monkeypatch, tmp_path):
    fake_pdf = FakePDF(
        pages=[
            FakePage(
                text="Layout changed. HEFA 63% of feedstock mix. No clear capacity or mandate values."
            )
        ],
        metadata={},
    )
    monkeypatch.setattr(easa_module.pdfplumber, "open", lambda _: fake_pdf)

    result = EASAReportParser(tmp_path / "2025_q3_changed.pdf").parse()

    assert result["hefa_share_pct"] == 63.0
    assert result["report_period"] == "2025-Q3"
    assert result["eu_saf_capacity_mt"] is None
    assert result["refueleu_mandate_progress_pct"] is None
    assert result["published_at"] is None
    assert result["source_status"]["status"] == "degraded"
    assert result["source_status"]["error_code"] == "PARTIAL_PARSE"
    assert result["source_status"]["confidence"] == 0.57


def test_easa_parse_empty_document_marks_unavailable(monkeypatch, tmp_path):
    fake_pdf = FakePDF(pages=[FakePage(text="  ", tables=[[[None, " "]]])], metadata={})
    monkeypatch.setattr(easa_module.pdfplumber, "open", lambda _: fake_pdf)

    result = EASAReportParser(tmp_path / "empty.pdf").parse()

    assert result["eu_saf_capacity_mt"] is None
    assert result["hefa_share_pct"] is None
    assert result["source_status"]["status"] == "unavailable"
    assert result["source_status"]["error_code"] == "EMPTY_DOCUMENT"
    assert result["source_status"]["confidence"] == 0.0
