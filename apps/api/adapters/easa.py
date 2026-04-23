"""EASA SAF quarterly report PDF parser.

This parser is intentionally tolerant of table and text layout changes in
quarterly EASA SAF reports. It extracts a small, stable output payload and
records confidence degradation when any key field cannot be recovered.
"""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional, Sequence

try:  # pdfplumber is the preferred parser; keep import optional for tests.
    import pdfplumber
except ImportError:  # pragma: no cover - exercised when dependency is absent.
    pdfplumber = SimpleNamespace(open=None)  # type: ignore[assignment]


_CAPACITY_PATTERNS: Sequence[re.Pattern[str]] = (
    re.compile(
        r"(?:EU\s+SAF\s+capacity|SAF\s+capacity|installed\s+capacity|capacity)"
        r"[^0-9]{0,80}(?P<value>\d+(?:[.,]\d+)?)\s*"
        r"(?P<unit>mt(?:pa|/yr|/y)?|million\s+tonnes?|m\s*tonnes?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<value>\d+(?:[.,]\d+)?)\s*"
        r"(?P<unit>mt(?:pa|/yr|/y)?|million\s+tonnes?|m\s*tonnes?)"
        r"[^A-Za-z0-9]{0,80}(?:EU\s+SAF\s+capacity|SAF\s+capacity|capacity)",
        re.IGNORECASE,
    ),
)

_HEFA_PATTERNS: Sequence[re.Pattern[str]] = (
    re.compile(
        r"(?:HEFA[^%\n]{0,80}?(?:share|mix|portion|account(?:ed)?\s+for)?"
        r"[^0-9]{0,40})(?P<value>\d{1,3}(?:[.,]\d+)?)\s*%",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bHEFA\b[^0-9%]{0,40}(?P<value>\d{1,3}(?:[.,]\d+)?)\s*%",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<value>\d{1,3}(?:[.,]\d+)?)\s*%[^%\n]{0,80}HEFA",
        re.IGNORECASE,
    ),
)

_REFUELEU_PATTERNS: Sequence[re.Pattern[str]] = (
    re.compile(
        r"(?:ReFuelEU[^%\n]{0,120}?(?:mandate|progress|implementation|compliance)"
        r"[^0-9]{0,40})(?P<value>\d{1,3}(?:[.,]\d+)?)\s*%",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?P<value>\d{1,3}(?:[.,]\d+)?)\s*%[^%\n]{0,120}ReFuelEU",
        re.IGNORECASE,
    ),
    re.compile(
        r"\bReFuelEU\b[^0-9%]{0,80}(?P<value>\d{1,3}(?:[.,]\d+)?)\s*%",
        re.IGNORECASE,
    ),
)

_QUARTER_PATTERNS: Sequence[re.Pattern[str]] = (
    re.compile(r"\bQ(?P<quarter>[1-4])\s*(?P<year>20\d{2})\b", re.IGNORECASE),
    re.compile(r"\b(?P<year>20\d{2})\s*Q(?P<quarter>[1-4])\b", re.IGNORECASE),
    re.compile(
        r"\b(?:report\s+period|period)\s*[:\-]?\s*"
        r"(?P<year>20\d{2})\s*[-/ ]?Q(?P<quarter>[1-4])\b",
        re.IGNORECASE,
    ),
)

_DATE_PATTERNS: Sequence[re.Pattern[str]] = (
    re.compile(
        r"\b(?P<year>20\d{2})[-/.](?P<month>\d{1,2})[-/.](?P<day>\d{1,2})\b"
    ),
    re.compile(
        r"\b(?P<day>\d{1,2})\s+"
        r"(?P<month_name>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|"
        r"Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
        r"Nov(?:ember)?|Dec(?:ember)?)\s+"
        r"(?P<year>20\d{2})\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?P<month_name>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|"
        r"Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
        r"Nov(?:ember)?|Dec(?:ember)?)\s+"
        r"(?P<day>\d{1,2}),?\s+(?P<year>20\d{2})\b",
        re.IGNORECASE,
    ),
)

_MONTH_LOOKUP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _to_float(raw_value: str) -> Optional[float]:
    candidate = raw_value.strip().replace(" ", "").replace(",", ".")
    try:
        return float(candidate)
    except ValueError:
        return None


def _parse_pdf_date(raw_value: Any) -> Optional[str]:
    if raw_value is None:
        return None
    text = str(raw_value).strip()
    if not text:
        return None

    # pdf metadata often looks like D:20260118100000Z
    match = re.search(r"D:(?P<date>\d{14})", text)
    if match:
        digits = match.group("date")
        return f"{digits[0:4]}-{digits[4:6]}-{digits[6:8]}"

    date_match = re.search(r"(?P<year>20\d{2})(?P<month>\d{2})(?P<day>\d{2})", text)
    if date_match:
        return (
            f"{date_match.group('year')}-{date_match.group('month')}"
            f"-{date_match.group('day')}"
        )

    for pattern in _DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue

        year = int(match.group("year"))
        day = int(match.group("day"))
        month_name = match.groupdict().get("month_name")
        if month_name:
            month = _MONTH_LOOKUP[month_name[:3].lower()]
        else:
            month = int(match.group("month"))
        return f"{year:04d}-{month:02d}-{day:02d}"

    return None


def _flatten_table(table: Sequence[Sequence[Any]]) -> List[str]:
    rows: List[str] = []
    for row in table:
        cells = []
        for cell in row:
            if cell is None:
                continue
            cell_text = _normalize_whitespace(str(cell))
            if cell_text:
                cells.append(cell_text)
        if cells:
            rows.append(" | ".join(cells))
    return rows


def _find_pattern_value(patterns: Sequence[re.Pattern[str]], text: str) -> Optional[float]:
    for pattern in patterns:
        match = pattern.search(text)
        if not match:
            continue
        value = _to_float(match.group("value"))
        if value is not None:
            return value
    return None


class EASAReportParser:
    """Parse EASA SAF quarterly report PDFs into a normalized payload."""

    def __init__(self, pdf_path: str | Path) -> None:
        self.pdf_path = Path(pdf_path)

    def parse(self) -> Dict[str, Any]:
        """Parse the configured PDF into a stable dictionary payload."""
        pdf_open = getattr(pdfplumber, "open", None)
        if not callable(pdf_open):
            return self._build_result(
                eu_saf_capacity_mt=None,
                hefa_share_pct=None,
                refueleu_mandate_progress_pct=None,
                report_period=None,
                published_at=None,
                status="unavailable",
                confidence=0.0,
                error_code="MISSING_DEPENDENCY",
                missing_fields=[
                    "eu_saf_capacity_mt",
                    "hefa_share_pct",
                    "refueleu_mandate_progress_pct",
                    "report_period",
                    "published_at",
                ],
            )

        try:
            with pdf_open(str(self.pdf_path)) as pdf:
                pages = list(getattr(pdf, "pages", []))
                metadata = dict(getattr(pdf, "metadata", {}) or {})
        except Exception:
            return self._build_result(
                eu_saf_capacity_mt=None,
                hefa_share_pct=None,
                refueleu_mandate_progress_pct=None,
                report_period=None,
                published_at=None,
                status="unavailable",
                confidence=0.0,
                error_code="PDF_READ_ERROR",
                missing_fields=[
                    "eu_saf_capacity_mt",
                    "hefa_share_pct",
                    "refueleu_mandate_progress_pct",
                    "report_period",
                    "published_at",
                ],
            )

        page_texts: List[str] = []
        page_rows: List[str] = []
        for page in pages:
            text = getattr(page, "extract_text", lambda: None)() or ""
            if text:
                page_texts.append(_normalize_whitespace(text))

            tables = getattr(page, "extract_tables", lambda: [])() or []
            for table in tables:
                page_rows.extend(_flatten_table(table))

        corpus = "\n".join(page_texts + page_rows)
        fallback_text = "\n".join(page_texts)

        result = {
            "eu_saf_capacity_mt": self._extract_capacity(corpus),
            "hefa_share_pct": self._extract_hefa_share(corpus),
            "refueleu_mandate_progress_pct": self._extract_refueleu_progress(corpus),
            "report_period": self._extract_report_period(corpus),
            "published_at": self._extract_published_at(corpus, metadata),
        }
        status, confidence, error_code, missing_fields = self._derive_source_status(
            result,
            corpus=corpus,
            fallback_text=fallback_text,
        )
        return self._build_result(
            status=status,
            confidence=confidence,
            error_code=error_code,
            missing_fields=missing_fields,
            **result,
        )

    def _extract_capacity(self, corpus: str) -> Optional[float]:
        return _find_pattern_value(_CAPACITY_PATTERNS, corpus)

    def _extract_hefa_share(self, corpus: str) -> Optional[float]:
        return _find_pattern_value(_HEFA_PATTERNS, corpus)

    def _extract_refueleu_progress(self, corpus: str) -> Optional[float]:
        return _find_pattern_value(_REFUELEU_PATTERNS, corpus)

    def _extract_report_period(self, corpus: str) -> Optional[str]:
        for pattern in _QUARTER_PATTERNS:
            match = pattern.search(corpus)
            if match:
                return f"{match.group('year')}-Q{match.group('quarter')}"

        filename_match = re.search(
            r"(?P<year>20\d{2})[-_ ]?q(?P<quarter>[1-4])",
            self.pdf_path.stem,
            re.IGNORECASE,
        )
        if filename_match:
            return f"{filename_match.group('year')}-Q{filename_match.group('quarter')}"

        return None

    def _extract_published_at(self, corpus: str, metadata: Dict[str, Any]) -> Optional[str]:
        metadata_candidates = (
            metadata.get("CreationDate"),
            metadata.get("ModDate"),
            metadata.get("Date"),
            metadata.get("published_at"),
        )
        for candidate in metadata_candidates:
            parsed = _parse_pdf_date(candidate)
            if parsed:
                return parsed

        publication_patterns = (
            re.compile(
                r"(?:published|publication\s+date|released|issued)\s*[:\-]?\s*"
                r"(?P<value>[^.\n]{0,80})",
                re.IGNORECASE,
            ),
            re.compile(r"(?P<value>[^.\n]{0,80})\b(?:published|released|issued)\b", re.IGNORECASE),
        )

        for pattern in publication_patterns:
            match = pattern.search(corpus)
            if not match:
                continue
            chunk = match.group("value")
            parsed = _parse_pdf_date(chunk)
            if parsed:
                return parsed
            for date_pattern in _DATE_PATTERNS:
                date_match = date_pattern.search(chunk)
                if date_match:
                    return _parse_pdf_date(date_match.group(0))
        return None

    def _derive_source_status(
        self,
        result: Dict[str, Any],
        *,
        corpus: str,
        fallback_text: str,
    ) -> tuple[str, float, Optional[str], List[str]]:
        missing_fields = [key for key, value in result.items() if value is None]
        filled_fields = len(result) - len(missing_fields)

        if not corpus.strip() and not fallback_text.strip():
            return "unavailable", 0.0, "EMPTY_DOCUMENT", missing_fields

        if filled_fields == len(result):
            return "healthy", 0.97, None, missing_fields

        # Tolerate layout changes: a partial parse should still be usable, but
        # confidence must drop once any key field is missing.
        confidence = max(0.35, round(0.96 - (0.13 * len(missing_fields)), 3))
        status = "degraded" if filled_fields >= 2 else "unavailable"
        error_code = "PARTIAL_PARSE" if filled_fields >= 2 else "INSUFFICIENT_SIGNAL"
        return status, confidence, error_code, missing_fields

    def _build_result(
        self,
        *,
        eu_saf_capacity_mt: Optional[float],
        hefa_share_pct: Optional[float],
        refueleu_mandate_progress_pct: Optional[float],
        report_period: Optional[str],
        published_at: Optional[str],
        status: str,
        confidence: float,
        error_code: Optional[str],
        missing_fields: List[str],
    ) -> Dict[str, Any]:
        return {
            "eu_saf_capacity_mt": eu_saf_capacity_mt,
            "hefa_share_pct": hefa_share_pct,
            "refueleu_mandate_progress_pct": refueleu_mandate_progress_pct,
            "report_period": report_period,
            "published_at": published_at,
            "source_status": {
                "status": status,
                "confidence": confidence,
                "error_code": error_code,
                "missing_fields": missing_fields,
            },
        }
