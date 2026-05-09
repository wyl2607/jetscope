#!/usr/bin/env python3
"""Dry-run AI assistant resource probe for the local model governor."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path("/Users/yumei/tools/automation")
DEFAULT_REGISTRY = ROOT / "config/ai-assistants.registry.yaml"
DEFAULT_OUTPUT = ROOT / "runtime/ai-resource/ai-resource-probe.json"
REQUIRED_FIELDS = {
    "id",
    "provider",
    "lifecycle",
    "task_lanes",
    "quota_window",
    "cost_model",
    "quality_score",
    "reliability_score",
    "privacy_class",
    "replacement_probe_enabled",
    "quota_probe_enabled",
    "benchmark_probe_enabled",
    "retirement_policy",
}
VALID_LIFECYCLES = {
    "core_pinned",
    "active",
    "candidate",
    "probation",
    "deprecated",
    "retired",
}


class RegistryError(ValueError):
    """Raised when the assistant registry is malformed."""


def parse_scalar(value: str) -> Any:
    value = value.strip()
    if value == "":
        return ""
    if value in {"true", "false"}:
        return value == "true"
    if value == "unknown":
        return "unknown"
    if value.startswith("[") and value.endswith("]"):
        body = value[1:-1].strip()
        if not body:
            return []
        return [parse_scalar(part.strip()) for part in body.split(",")]
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value.strip('"').strip("'")


def load_registry(path: Path = DEFAULT_REGISTRY) -> Dict[str, Any]:
    """Load the narrow YAML subset used by ai-assistants.registry.yaml."""

    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RegistryError(f"cannot read registry: {path}") from exc

    data: Dict[str, Any] = {}
    assistants: List[Dict[str, Any]] = []
    current: Dict[str, Any] | None = None
    current_nested: str | None = None

    for raw in lines:
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        stripped = line.strip()
        if not raw.startswith(" "):
            key, sep, value = stripped.partition(":")
            if not sep:
                raise RegistryError(f"invalid top-level line: {raw}")
            if key == "assistants":
                data["assistants"] = assistants
            else:
                data[key] = parse_scalar(value)
            current_nested = None
            continue
        if stripped.startswith("- "):
            if current is not None:
                assistants.append(current)
            current = {}
            current_nested = None
            rest = stripped[2:]
            key, sep, value = rest.partition(":")
            if not sep:
                raise RegistryError(f"invalid assistant line: {raw}")
            current[key] = parse_scalar(value)
            continue
        if current is None:
            raise RegistryError(f"nested value before assistant entry: {raw}")
        indent = len(raw) - len(raw.lstrip(" "))
        key, sep, value = stripped.partition(":")
        if not sep:
            raise RegistryError(f"invalid nested line: {raw}")
        if indent == 4 and value.strip() == "":
            current[key] = {}
            current_nested = key
            continue
        if indent >= 6 and current_nested:
            nested = current.setdefault(current_nested, {})
            if not isinstance(nested, dict):
                raise RegistryError(f"nested key is not a mapping: {current_nested}")
            nested[key] = parse_scalar(value)
        else:
            current[key] = parse_scalar(value)
            current_nested = None

    if current is not None:
        assistants.append(current)
    data["assistants"] = assistants
    validate_registry(data)
    return data


def validate_registry(registry: Dict[str, Any]) -> None:
    assistants = registry.get("assistants")
    if not isinstance(assistants, list) or not assistants:
        raise RegistryError("registry must contain a non-empty assistants list")
    seen = set()
    for assistant in assistants:
        if not isinstance(assistant, dict):
            raise RegistryError("assistant entry must be a mapping")
        missing = sorted(REQUIRED_FIELDS - set(assistant))
        if missing:
            raise RegistryError(f"{assistant.get('id', '<unknown>')} missing fields: {', '.join(missing)}")
        assistant_id = assistant["id"]
        if assistant_id in seen:
            raise RegistryError(f"duplicate assistant id: {assistant_id}")
        seen.add(assistant_id)
        if assistant["lifecycle"] not in VALID_LIFECYCLES:
            raise RegistryError(f"{assistant_id} has invalid lifecycle: {assistant['lifecycle']}")
        if not isinstance(assistant["task_lanes"], list) or not assistant["task_lanes"]:
            raise RegistryError(f"{assistant_id} must define task_lanes")
        if not isinstance(assistant["quota_window"], dict):
            raise RegistryError(f"{assistant_id} quota_window must be a mapping")
        for score_name in ("quality_score", "reliability_score"):
            score = assistant[score_name]
            if not isinstance(score, (int, float)) or not 0 <= float(score) <= 1:
                raise RegistryError(f"{assistant_id} {score_name} must be between 0 and 1")
        if assistant["lifecycle"] == "core_pinned" and not str(assistant["retirement_policy"]).startswith("core_pinned"):
            raise RegistryError(f"{assistant_id} core_pinned assistant must not have auto-retirement policy")


def quota_confidence(quota_window: Dict[str, Any]) -> str:
    remaining = quota_window.get("remaining_estimate", "unknown")
    confidence = quota_window.get("confidence", "estimated")
    if remaining == "unknown":
        return "estimated"
    if confidence in {"exact", "observed"}:
        return str(confidence)
    return "estimated"


def probe_assistant(assistant: Dict[str, Any], *, dry_run: bool = True) -> Dict[str, Any]:
    quota_window = assistant["quota_window"]
    return {
        "id": assistant["id"],
        "provider": assistant["provider"],
        "lifecycle": assistant["lifecycle"],
        "core_pinned": assistant["lifecycle"] == "core_pinned",
        "replacement_probe": {
            "enabled": bool(assistant["replacement_probe_enabled"]),
            "status": "skipped_core_pinned" if assistant["lifecycle"] == "core_pinned" else "dry_run",
        },
        "quota_probe": {
            "enabled": bool(assistant["quota_probe_enabled"]),
            "dry_run": dry_run,
            "remaining_estimate": quota_window.get("remaining_estimate", "unknown"),
            "confidence": quota_confidence(quota_window),
        },
        "benchmark_probe": {
            "enabled": bool(assistant["benchmark_probe_enabled"]),
            "status": "dry_run" if assistant["benchmark_probe_enabled"] else "disabled",
        },
        "health": "unknown_dry_run",
    }


def run_probe(registry_path: Path = DEFAULT_REGISTRY, output_path: Path = DEFAULT_OUTPUT, *, dry_run: bool = True) -> Dict[str, Any]:
    registry = load_registry(registry_path)
    result = {
        "schema_version": "ai-resource-probe-1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "registry_path": str(registry_path),
        "api_calls_performed": 0,
        "assistants": [probe_assistant(assistant, dry_run=dry_run) for assistant in registry["assistants"]],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=True, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--json", action="store_true", help="print JSON result")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    try:
        result = run_probe(args.registry, args.out, dry_run=True)
    except RegistryError as exc:
        print(f"ai_resource_probe: {exc}", file=sys.stderr)
        return 2
    if args.json or args.self_test:
        print(json.dumps(result, ensure_ascii=True, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
