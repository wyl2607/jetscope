from __future__ import annotations

import json
from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[1] / "openapi.json"
ADMIN_TOKEN_NAME = "x-admin-token"


def _load_openapi():
    return json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))


def _get_operation(spec: dict, path: str, method: str) -> dict:
    path_item = spec["paths"].get(path)
    assert path_item is not None, f"Missing OpenAPI path: {path}"

    operation = path_item.get(method)
    assert operation is not None, f"Missing {method.upper()} method for {path}"
    return operation


def _has_admin_token_parameter(operation: dict) -> bool:
    for parameter in operation.get("parameters", []):
        if (
            isinstance(parameter, dict)
            and parameter.get("name") == ADMIN_TOKEN_NAME
            and parameter.get("in") == "header"
        ):
            return True
    return False


def _has_admin_security_scheme(operation: dict) -> bool:
    security = operation.get("security")
    if not security:
        return False

    for scheme_map in security:
        if not isinstance(scheme_map, dict):
            continue
        for scheme_name in scheme_map:
            lowered = str(scheme_name).lower()
            if "admin" in lowered or "token" in lowered:
                return True
    return False


def _assert_admin_protected(path: str, method: str) -> None:
    spec = _load_openapi()
    operation = _get_operation(spec, path, method)
    assert (
        _has_admin_security_scheme(operation) or _has_admin_token_parameter(operation)
    ), (
        f"Expected admin protection for {method.upper()} {path};"
        f" found neither security scheme nor {ADMIN_TOKEN_NAME} header parameter"
    )


def test_openapi_core_analysis_paths_and_methods() -> None:
    spec = _load_openapi()
    paths = spec["paths"]

    expected: list[tuple[str, str]] = [
        ("/v1/analysis/grid-parity", "get"),
        ("/v1/analysis/grid-parity/history", "get"),
        ("/v1/analysis/grid-parity/history/seed", "post"),
        ("/v1/analysis/grid-parity/lcoe-sensitivity", "get"),
        ("/v1/analysis/heat-parity", "get"),
        ("/v1/analysis/heat-parity/sensitivity", "get"),
    ]

    for path, method in expected:
        assert path in paths, f"Missing path: {path}"
        assert method in paths[path], f"Expected {method.upper()} on {path}"


def test_openapi_grid_parity_seed_route_is_admin_protected() -> None:
    _assert_admin_protected("/v1/analysis/grid-parity/history/seed", "post")


def test_openapi_workspace_write_routes_are_admin_protected() -> None:
    protected_endpoints: list[tuple[str, str]] = [
        ("/v1/workspaces/{workspace_slug}/preferences", "put"),
        ("/v1/workspaces/{workspace_slug}/preferences", "delete"),
        ("/v1/workspaces/{workspace_slug}/scenarios", "post"),
        ("/v1/workspaces/{workspace_slug}/scenarios/{scenario_id}", "put"),
        ("/v1/workspaces/{workspace_slug}/scenarios/{scenario_id}", "delete"),
    ]

    for path, method in protected_endpoints:
        _assert_admin_protected(path, method)


def test_readiness_path_is_get_and_does_not_leak_secret_value_terms() -> None:
    spec = _load_openapi()
    operation = _get_operation(spec, "/v1/readiness", "get")

    responses = operation.get("responses", {})
    response_200 = responses.get("200")
    assert response_200 is not None, "GET /v1/readiness must have a 200 response"

    response_text = json.dumps(response_200).lower()
    for forbidden in ("token value", "secret value"):
        assert forbidden not in response_text, (
            f"GET /v1/readiness response should not expose wording '{forbidden}'"
        )
