#!/usr/bin/env python3
"""Read-only drift scanner for Evolution Registry mirror pairs."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REGISTRY = ROOT / "workspace-guides/evolution-registry.json"
DEFAULT_JSON = ROOT / "runtime/self-evolution/mirror-drift-scan.json"
DEFAULT_MD = ROOT / "runtime/self-evolution/mirror-drift-scan.md"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"expected object JSON: {path}")
    return data


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def endpoint(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "exists": path.exists(),
        "kind": "dir" if path.is_dir() else "file" if path.is_file() else "missing",
        "sha256": sha256(path) if path.is_file() else "",
    }


def finding(pair: dict[str, Any], kind: str, level: str, mode: str, message: str, **extra: Any) -> dict[str, Any]:
    row = {
        "pair_id": pair.get("id"),
        "kind": kind,
        "level": level,
        "mode": mode,
        "message": message,
        "source": pair.get("source"),
        "mirror": pair.get("mirror"),
        "relationship": pair.get("relationship"),
        "status": pair.get("status"),
    }
    row.update(extra)
    return row


def scan_pair(pair: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    source = Path(str(pair.get("source") or "")).expanduser()
    mirror = Path(str(pair.get("mirror") or "")).expanduser()
    status = str(pair.get("status") or "")
    relationship = str(pair.get("relationship") or "")
    conflict_policy = str(pair.get("conflictPolicy") or "")
    direction = str(pair.get("direction") or "")

    source_ep = endpoint(source)
    mirror_ep = endpoint(mirror)
    if not source_ep["exists"]:
        rows.append(finding(pair, "mirror-source-missing", "P0", "approval-required", "Mirror pair source is missing.", source_endpoint=source_ep, mirror_endpoint=mirror_ep))
        return rows
    if not mirror_ep["exists"]:
        if status == "active":
            rows.append(finding(pair, "active-mirror-target-missing", "P0", "approval-required", "Active mirror target is missing.", source_endpoint=source_ep, mirror_endpoint=mirror_ep))
        elif status == "proposed":
            rows.append(
                finding(
                    pair,
                    "proposed-mirror-target-missing",
                    "P2",
                    "informational",
                    "Proposed mirror target has not been created yet; creation/write-back requires human approval.",
                    source_endpoint=source_ep,
                    mirror_endpoint=mirror_ep,
                    approval_required=True,
                    next_action="request-human-approval-before-mirror-creation",
                    privacy_gate=pair.get("privacyGate"),
                    conflict_policy=conflict_policy,
                    source_of_truth=pair.get("sourceOfTruth"),
                )
            )
        else:
            rows.append(finding(pair, "mirror-target-missing", "P1", "review-first", "Mirror target is missing.", source_endpoint=source_ep, mirror_endpoint=mirror_ep))
        return rows

    if relationship == "derived-index":
        if conflict_policy != "do-not-merge-derived-output-back" or direction != "project-to-obsidian-derived":
            rows.append(
                finding(
                    pair,
                    "derived-index-policy-unsafe",
                    "P0",
                    "approval-required",
                    "Derived index must be one-way and must not be merged back into the project source.",
                    source_endpoint=source_ep,
                    mirror_endpoint=mirror_ep,
                )
            )
        else:
            rows.append(
                finding(
                    pair,
                    "derived-index-registered",
                    "P4",
                    "informational",
                    "Derived index is registered as one-way; content hash differences are expected.",
                    source_endpoint=source_ep,
                    mirror_endpoint=mirror_ep,
                )
            )
        return rows

    if relationship == "mirror":
        if source_ep["kind"] != "file" or mirror_ep["kind"] != "file":
            rows.append(finding(pair, "mirror-endpoint-not-file", "P1", "review-first", "One-to-one mirrors must point at files for hash drift checks.", source_endpoint=source_ep, mirror_endpoint=mirror_ep))
        elif source_ep["sha256"] != mirror_ep["sha256"]:
            rows.append(finding(pair, "mirror-content-drift", "P1", "review-first", "One-to-one mirror content differs from the registered source.", source_endpoint=source_ep, mirror_endpoint=mirror_ep))
        return rows

    rows.append(finding(pair, "mirror-relationship-not-scanned", "P4", "informational", "Mirror relationship is registered but has no content drift rule.", source_endpoint=source_ep, mirror_endpoint=mirror_ep))
    return rows


def scan_registry(registry_path: Path = DEFAULT_REGISTRY) -> dict[str, Any]:
    registry = read_json(registry_path)
    pairs = registry.get("mirrorPairs") if isinstance(registry.get("mirrorPairs"), list) else []
    findings: list[dict[str, Any]] = []
    for pair in pairs:
        if isinstance(pair, dict):
            findings.extend(scan_pair(pair))
    blocking = [item for item in findings if item["mode"] == "approval-required" or item["level"] == "P0"]
    warnings = [item for item in findings if item["mode"] in {"review-first", "informational"} and item["kind"] != "derived-index-registered"]
    drift = [item for item in findings if item["kind"] == "mirror-content-drift"]
    return {
        "ok": not blocking,
        "generated_at": utc_now(),
        "scanner": "mirror-drift-scan",
        "registry": str(registry_path),
        "summary": {
            "mirror_pair_count": len(pairs),
            "finding_count": len(findings),
            "blocking_count": len(blocking),
            "warning_count": len(warnings),
            "drift_count": len(drift),
        },
        "findings": findings,
    }


def write_report(report: dict[str, Any], json_out: Path, markdown_out: Path) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_out.write_text(render_markdown(report), encoding="utf-8")


def render_markdown(report: dict[str, Any]) -> str:
    summary = report.get("summary") or {}
    lines = [
        "# Mirror Drift Scan",
        "",
        f"- ok: `{str(report.get('ok')).lower()}`",
        f"- mirror pairs: `{summary.get('mirror_pair_count', 0)}`",
        f"- blocking: `{summary.get('blocking_count', 0)}`",
        f"- drift: `{summary.get('drift_count', 0)}`",
        f"- warnings: `{summary.get('warning_count', 0)}`",
        "",
        "Safety: read-only report; no Obsidian sync, file rewrite, Git, push, PR, deploy, or remote mutation.",
        "",
        "## Findings",
    ]
    findings = report.get("findings") or []
    if not findings:
        lines.append("- None.")
    for item in findings:
        lines.append(f"- `{item.get('level')}` `{item.get('mode')}` `{item.get('kind')}` `{item.get('pair_id')}`: {item.get('message')}")
        if item.get("approval_required"):
            lines.append(f"  - next action: `{item.get('next_action')}`")
            lines.append(f"  - source of truth: `{item.get('source_of_truth')}`")
            lines.append(f"  - privacy gate: `{item.get('privacy_gate')}`")
            lines.append(f"  - conflict policy: `{item.get('conflict_policy')}`")
    return "\n".join(lines) + "\n"


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        source = root / "source.md"
        mirror = root / "mirror.md"
        source.write_text("a\n", encoding="utf-8")
        mirror.write_text("b\n", encoding="utf-8")
        registry = root / "registry.json"
        registry.write_text(
            json.dumps(
                {
                    "mirrorPairs": [
                        {
                            "id": "pair",
                            "source": str(source),
                            "mirror": str(mirror),
                            "status": "active",
                            "relationship": "mirror",
                            "direction": "project-to-obsidian",
                            "conflictPolicy": "project-wins-unless-human-promotes-obsidian-note",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        report = scan_registry(registry)
        assert report["summary"]["drift_count"] == 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MD)
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print(json.dumps({"ok": True, "script": "mirror-drift-scan"}, indent=2))
        return 0
    report = scan_registry(args.registry)
    if not args.no_write:
        write_report(report, args.json_out, args.markdown_out)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
