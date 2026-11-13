import json
from pathlib import Path

import pytest


MARKET_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "curated" / "market"
MARKET_FILES = sorted(MARKET_DATA_DIR.glob("*.json"))


def _url_fields(value: object, key_path: tuple[str, ...] = ()):
    if isinstance(value, dict):
        for key, nested_value in value.items():
            nested_key_path = (*key_path, str(key))
            if "url" in key.lower() and isinstance(nested_value, str):
                yield nested_key_path, nested_value
            yield from _url_fields(nested_value, nested_key_path)
    elif isinstance(value, list):
        for index, nested_value in enumerate(value):
            yield from _url_fields(nested_value, (*key_path, str(index)))


def test_curated_market_files_discovered():
    assert MARKET_FILES, f"no curated market files found in {MARKET_DATA_DIR}"


@pytest.mark.parametrize("market_file", MARKET_FILES, ids=lambda path: path.name)
def test_curated_market_file_has_note(market_file: Path):
    document = json.loads(market_file.read_text(encoding="utf-8"))

    assert isinstance(document, dict)
    assert isinstance(document.get("note"), str)
    assert document["note"].strip()


@pytest.mark.parametrize("market_file", MARKET_FILES, ids=lambda path: path.name)
def test_curated_market_urls_use_https(market_file: Path):
    document = json.loads(market_file.read_text(encoding="utf-8"))

    url_fields = list(_url_fields(document))

    assert url_fields, f"{market_file.name}: no source URL fields"
    for key_path, url in url_fields:
        assert url.startswith("https://"), f"{market_file.name}:{'.'.join(key_path)}"
