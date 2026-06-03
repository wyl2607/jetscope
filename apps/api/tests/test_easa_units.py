"""Focused unit tests for EASA parser — pure functions & methods in isolation."""

from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List

from adapters import easa as easa_module
from adapters.easa import (
    EASAReportParser,
    _CAPACITY_PATTERNS,
    _HEFA_PATTERNS,
    _REFUELEU_PATTERNS,
    _QUARTER_PATTERNS,
    _DATE_PATTERNS,
    _flatten_table,
    _normalize_whitespace,
    _parse_pdf_date,
    _find_pattern_value,
    _to_float,
)


# ── Pure helper functions ──────────────────────────────────────────────────


class TestNormalizeWhitespace:
    def test_collapses_multiple_spaces(self) -> None:
        assert _normalize_whitespace("hello   world") == "hello world"

    def test_strips_outer_whitespace(self) -> None:
        assert _normalize_whitespace("  foo bar  ") == "foo bar"

    def test_collapses_newlines_and_tabs(self) -> None:
        assert _normalize_whitespace("line1\n\tline2\n  line3") == "line1 line2 line3"

    def test_empty_string(self) -> None:
        assert _normalize_whitespace("") == ""


class TestToFloat:
    def test_simple_integer(self) -> None:
        assert _to_float("42") == 42.0

    def test_decimal(self) -> None:
        assert _to_float("12.4") == 12.4

    def test_european_comma(self) -> None:
        assert _to_float("12,4") == 12.4

    def test_with_internal_space(self) -> None:
        assert _to_float("1 234.56") == 1234.56

    def test_garbage_returns_none(self) -> None:
        assert _to_float("N/A") is None

    def test_empty_string_returns_none(self) -> None:
        assert _to_float("") is None


class TestParsePdfDate:
    def test_none_returns_none(self) -> None:
        assert _parse_pdf_date(None) is None

    def test_empty_string_returns_none(self) -> None:
        assert _parse_pdf_date("") is None

    def test_pdf_metadata_format(self) -> None:
        assert _parse_pdf_date("D:20260118100000Z") == "2026-01-18"

    def test_compact_digits(self) -> None:
        assert _parse_pdf_date("20260203120000") == "2026-02-03"

    def test_named_month_before_day(self) -> None:
        assert _parse_pdf_date("18 January 2026") == "2026-01-18"

    def test_named_month_after_day(self) -> None:
        assert _parse_pdf_date("January 18, 2026") == "2026-01-18"

    def test_iso_dash_separated(self) -> None:
        assert _parse_pdf_date("2026-03-15") == "2026-03-15"

    def test_slash_separated(self) -> None:
        assert _parse_pdf_date("2026/04/01") == "2026-04-01"

    def test_dot_separated(self) -> None:
        assert _parse_pdf_date("2026.05.30") == "2026-05-30"

    def test_unparseable_returns_none(self) -> None:
        assert _parse_pdf_date("sometime next year") is None


class TestFlattenTable:
    def test_basic_table(self) -> None:
        table: List[List[Any]] = [
            ["Metric", "Value"],
            ["Capacity", "12.4"],
        ]
        rows = _flatten_table(table)
        assert rows == ["Metric | Value", "Capacity | 12.4"]

    def test_skips_none_cells(self) -> None:
        table: List[List[Any]] = [
            ["A", None, "B"],
        ]
        rows = _flatten_table(table)
        assert rows == ["A | B"]

    def test_skips_empty_rows(self) -> None:
        table: List[List[Any]] = [
            ["A"],
            [None],
        ]
        rows = _flatten_table(table)
        assert rows == ["A"]

    def test_empty_table(self) -> None:
        assert _flatten_table([]) == []


# ── Pattern matching ────────────────────────────────────────────────────────


class TestFindPatternValue:
    def test_capacity_first_pattern(self) -> None:
        text = "EU SAF capacity reached 12.4 million tonnes in 2025."
        assert _find_pattern_value(_CAPACITY_PATTERNS, text) == 12.4

    def test_capacity_unit_mt(self) -> None:
        text = "installed capacity 5.0 mtpa"
        assert _find_pattern_value(_CAPACITY_PATTERNS, text) == 5.0

    def test_capacity_value_before_unit(self) -> None:
        text = "SAF capacity 8 mt"
        assert _find_pattern_value(_CAPACITY_PATTERNS, text) == 8.0

    def test_hefa_percent(self) -> None:
        text = "HEFA share accounted for 58.0% of SAF supply."
        assert _find_pattern_value(_HEFA_PATTERNS, text) == 58.0

    def test_hefa_mix_percent(self) -> None:
        text = "HEFA mix reached 61%"
        assert _find_pattern_value(_HEFA_PATTERNS, text) == 61.0

    def test_hefa_percent_before_label(self) -> None:
        text = "Only 42.5% is HEFA based"
        assert _find_pattern_value(_HEFA_PATTERNS, text) == 42.5

    def test_refueleu_mandate_text(self) -> None:
        text = "ReFuelEU mandate progress now 18.5%"
        assert _find_pattern_value(_REFUELEU_PATTERNS, text) == 18.5

    def test_refueleu_compliance_text(self) -> None:
        text = "ReFuelEU compliance reached 22.0%"
        assert _find_pattern_value(_REFUELEU_PATTERNS, text) == 22.0

    def test_refueleu_percent_before(self) -> None:
        text = "15.3% ReFuelEU implementation"
        assert _find_pattern_value(_REFUELEU_PATTERNS, text) == 15.3

    def test_no_match_returns_none(self) -> None:
        assert _find_pattern_value(_CAPACITY_PATTERNS, "nothing relevant") is None


# ── EASAReportParser methods (no PDF I/O) ───────────────────────────────────


class TestExtractCapacity:
    def test_happy_path(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_capacity("EU SAF capacity 12.4 million tonnes") == 12.4

    def test_no_match(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_capacity("no numbers here") is None


class TestExtractHefaShare:
    def test_happy_path(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_hefa_share("HEFA share 58.0%") == 58.0

    def test_no_match(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_hefa_share("no HEFA data") is None


class TestExtractRefuelEuProgress:
    def test_happy_path(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_refueleu_progress("ReFuelEU mandate 18.5%") == 18.5

    def test_no_match(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_refueleu_progress("no ReFuelEU data") is None


class TestExtractReportPeriod:
    def test_from_text_q_format(self) -> None:
        parser = EASAReportParser(Path("/fake/2025_Q4_report.pdf"))
        assert parser._extract_report_period("EASA report Q4 2025") == "2025-Q4"

    def test_from_text_year_first(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_report_period("2025 Q4 report period") == "2025-Q4"

    def test_from_filename_fallback(self) -> None:
        parser = EASAReportParser(Path("/fake/2025_q4_report.pdf"))
        assert parser._extract_report_period("no period in text") == "2025-Q4"

    def test_no_match_returns_none(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_report_period("no period info") is None

    def test_report_period_label(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        text = "Report period: 2026-Q1"
        assert parser._extract_report_period(text) == "2026-Q1"


class TestExtractPublishedAt:
    def test_from_metadata_creation_date(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        date = parser._extract_published_at(
            "some text", {"CreationDate": "D:20260118100000Z"}
        )
        assert date == "2026-01-18"

    def test_from_metadata_mod_date(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        date = parser._extract_published_at(
            "some text", {"ModDate": "D:20260203120000Z"}
        )
        assert date == "2026-02-03"

    def test_from_corpus_published_label(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        date = parser._extract_published_at(
            "Published 18 January 2026.", {}
        )
        assert date == "2026-01-18"

    def test_from_corpus_released_label(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        date = parser._extract_published_at(
            "Released: 15 March 2026", {}
        )
        assert date == "2026-03-15"

    def test_from_corpus_issued_label(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        date = parser._extract_published_at(
            "Issued 2026-04-01", {}
        )
        assert date == "2026-04-01"

    def test_no_date_found_returns_none(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        assert parser._extract_published_at("no date here", {}) is None


class TestDeriveSourceStatus:
    def test_all_fields_filled_healthy(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        result = {
            "eu_saf_capacity_mt": 12.4,
            "hefa_share_pct": 58.0,
            "refueleu_mandate_progress_pct": 18.5,
            "report_period": "2025-Q4",
            "published_at": "2026-01-18",
        }
        status, confidence, error_code, missing = parser._derive_source_status(
            result, corpus="some text", fallback_text="some text"
        )
        assert status == "healthy"
        assert confidence >= 0.95
        assert error_code is None
        assert missing == []

    def test_empty_corpus_unavailable(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        result = {
            "eu_saf_capacity_mt": None,
            "hefa_share_pct": None,
            "refueleu_mandate_progress_pct": None,
            "report_period": None,
            "published_at": None,
        }
        status, confidence, error_code, missing = parser._derive_source_status(
            result, corpus="", fallback_text=""
        )
        assert status == "unavailable"
        assert confidence == 0.0
        assert error_code == "EMPTY_DOCUMENT"

    def test_two_fields_filled_degraded(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        result = {
            "eu_saf_capacity_mt": 12.4,
            "hefa_share_pct": 58.0,
            "refueleu_mandate_progress_pct": None,
            "report_period": None,
            "published_at": None,
        }
        status, confidence, error_code, missing = parser._derive_source_status(
            result, corpus="some text", fallback_text="some text"
        )
        assert status == "degraded"
        assert error_code == "PARTIAL_PARSE"
        assert "refueleu_mandate_progress_pct" in missing
        assert "report_period" in missing
        assert "published_at" in missing

    def test_only_one_field_filled_insufficient(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        result = {
            "eu_saf_capacity_mt": 12.4,
            "hefa_share_pct": None,
            "refueleu_mandate_progress_pct": None,
            "report_period": None,
            "published_at": None,
        }
        status, confidence, error_code, missing = parser._derive_source_status(
            result, corpus="some text", fallback_text="some text"
        )
        assert status == "unavailable"
        assert confidence <= 0.5
        assert error_code == "INSUFFICIENT_SIGNAL"


class TestBuildResult:
    def test_full_result_structure(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        result = parser._build_result(
            eu_saf_capacity_mt=12.4,
            hefa_share_pct=58.0,
            refueleu_mandate_progress_pct=18.5,
            report_period="2025-Q4",
            published_at="2026-01-18",
            status="healthy",
            confidence=0.97,
            error_code=None,
            missing_fields=[],
        )
        assert result["eu_saf_capacity_mt"] == 12.4
        assert result["hefa_share_pct"] == 58.0
        assert result["refueleu_mandate_progress_pct"] == 18.5
        assert result["report_period"] == "2025-Q4"
        assert result["published_at"] == "2026-01-18"
        assert result["source_status"] == {
            "status": "healthy",
            "confidence": 0.97,
            "error_code": None,
            "missing_fields": [],
        }

    def test_all_none_result(self) -> None:
        parser = EASAReportParser(Path("/fake/report.pdf"))
        result = parser._build_result(
            eu_saf_capacity_mt=None,
            hefa_share_pct=None,
            refueleu_mandate_progress_pct=None,
            report_period=None,
            published_at=None,
            status="unavailable",
            confidence=0.0,
            error_code="EMPTY_DOCUMENT",
            missing_fields=[
                "eu_saf_capacity_mt",
                "hefa_share_pct",
                "refueleu_mandate_progress_pct",
                "report_period",
                "published_at",
            ],
        )
        assert all(result[k] is None for k in ("eu_saf_capacity_mt", "hefa_share_pct",
                    "refueleu_mandate_progress_pct", "report_period", "published_at"))
        assert result["source_status"]["status"] == "unavailable"
        assert result["source_status"]["confidence"] == 0.0
        assert result["source_status"]["error_code"] == "EMPTY_DOCUMENT"
