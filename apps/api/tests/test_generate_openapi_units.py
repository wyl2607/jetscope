import json
import sys
import types
from pathlib import Path


API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import generate_openapi


def _install_fake_app(monkeypatch, fake_app):
    app_package = types.ModuleType("app")
    app_package.__path__ = []
    main_module = types.ModuleType("app.main")
    main_module.app = fake_app

    monkeypatch.setitem(sys.modules, "app", app_package)
    monkeypatch.setitem(sys.modules, "app.main", main_module)


def test_main_writes_openapi_schema_to_configured_output(tmp_path, monkeypatch, capsys):
    output_path = tmp_path / "schema.json"
    schema = {
        "openapi": "3.1.0",
        "info": {"title": "JetScope API", "version": "test"},
        "paths": {"/health": {}, "/readiness": {}},
    }

    class FakeApp:
        def openapi(self):
            return schema

    _install_fake_app(monkeypatch, FakeApp())
    monkeypatch.setenv("JETSCOPE_OPENAPI_OUTPUT", str(output_path))

    result = generate_openapi.main()

    assert result == 0
    assert json.loads(output_path.read_text(encoding="utf-8")) == schema
    assert output_path.read_text(encoding="utf-8").endswith("\n")
    assert f"OpenAPI schema written to {output_path} (2 paths)" in capsys.readouterr().out


def test_main_returns_error_when_openapi_generation_fails(tmp_path, monkeypatch, capsys):
    output_path = tmp_path / "schema.json"

    class BrokenApp:
        def openapi(self):
            raise RuntimeError("schema exploded")

    _install_fake_app(monkeypatch, BrokenApp())
    monkeypatch.setenv("JETSCOPE_OPENAPI_OUTPUT", str(output_path))

    result = generate_openapi.main()

    captured = capsys.readouterr()

    assert result == 1
    assert not output_path.exists()
    assert "Failed to generate OpenAPI schema: schema exploded" in captured.err


def test_main_returns_error_when_output_cannot_be_written(tmp_path, monkeypatch, capsys):
    output_path = tmp_path / "missing" / "schema.json"

    class FakeApp:
        def openapi(self):
            return {"paths": {"/health": {}}}

    _install_fake_app(monkeypatch, FakeApp())
    monkeypatch.setenv("JETSCOPE_OPENAPI_OUTPUT", str(output_path))

    result = generate_openapi.main()
    captured = capsys.readouterr()

    assert result == 1
    assert not output_path.exists()
    assert f"Failed to write OpenAPI schema to {output_path}" in captured.err
