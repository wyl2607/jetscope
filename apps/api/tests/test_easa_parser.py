from dataclasses import dataclass
from pathlib import Path
import sys
from typing import Any, Dict, List

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from adapters import easa as easa_module
from adapters.easa import EASAReportParser


@dataclass
class FakePage:
    text: str
    tables: List[List[List[str]]] | None = None

    def extract_text(self) -> str:
        return self.text

    def extract_tables(self) -> List[List[List[str]]]:
        return self.tables or []


class FakePDF:
    def __init__(self, pages: List[FakePage], metadata: Dict[str, Any] | None = None):
        self.pages = pages
        self.metadata = metadata or {}

    def __enter__(self) -> "FakePDF":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


def test_easa_parser_parses_normal_pdf(monkeypatch, tmp_path):
    fake_pdf = FakePDF(
        pages=[
            FakePage(
                text=(
                    "EASA SAF quarterly report 2025 Q4\n"
                    "EU SAF capacity reached 12.4 million tonnes in 2025.\n"
                    "HEFA share reached 58.0% of SAF supply.\n"
                    "ReFuelEU mandate progress now 18.5%.\n"
                    "Published 18 January 2026."
                ),
                tables=[
                    [
                        ["Metric", "Value"],
                        ["EU SAF capacity", "12.4 million tonnes"],
                        ["HEFA share", "58.0%"],
                        ["ReFuelEU progress", "18.5%"],
                    ]
                ],
            )
        ],
        metadata={"CreationDate": "D:20260118104500Z"},
    )
    monkeypatch.setattr(easa_module.pdfplumber, "open", lambda _: fake_pdf)

    parser = EASAReportParser(tmp_path / "mock_easa.pdf")
    result = parser.parse()

    assert result["eu_saf_capacity_mt"] == 12.4
    assert result["hefa_share_pct"] == 58.0
    assert result["refueleu_mandate_progress_pct"] == 18.5
    assert result["report_period"] == "2025-Q4"
    assert result["published_at"] == "2026-01-18"
    assert result["source_status"]["status"] == "healthy"
    assert result["source_status"]["confidence"] >= 0.95


def test_easa_parser_degrades_on_format_change(monkeypatch, tmp_path):
    fake_pdf = FakePDF(
        pages=[
            FakePage(
                text=(
                    "This quarterly report changed layout.\n"
                    "Only the HEFA mix can be inferred: HEFA 61% of total supply.\n"
                    "No reliable capacity or mandate figures present."
                )
            )
        ],
        metadata={},
    )
    monkeypatch.setattr(easa_module.pdfplumber, "open", lambda _: fake_pdf)

    parser = EASAReportParser(tmp_path / "2025_q4_altered_layout.pdf")
    result = parser.parse()

    assert result["eu_saf_capacity_mt"] is None
    assert result["hefa_share_pct"] == 61.0
    assert result["refueleu_mandate_progress_pct"] is None
    assert result["report_period"] == "2025-Q4"
    assert result["published_at"] is None
    assert result["source_status"]["status"] == "degraded"
    assert result["source_status"]["confidence"] < 0.95
    assert set(result["source_status"]["missing_fields"]) == {
        "eu_saf_capacity_mt",
        "refueleu_mandate_progress_pct",
        "published_at",
    }
