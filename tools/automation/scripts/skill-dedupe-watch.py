#!/usr/bin/env python3
"""Snapshot the post-G8 wave-1 skill structure and log anomalies.

Designed for the 24-72h observation window after wave 1. Read-only.

Modes:
  --once       Append one snapshot to watch-log.jsonl and exit (default)
  --analyze    Read the log and print a trend report
  --diff       Compare latest snapshot vs the previous one

Schedule example (launchd or cron):
  */30 * * * * /usr/bin/python3 /Users/yumei/tools/automation/scripts/skill-dedupe-watch.py --once
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path("/Users/yumei/tools/automation")
LOG_PATH = ROOT / "runtime/skill-chains/dedupe/watch-log.jsonl"
DASHBOARD_LOG_PATH = ROOT / "runtime/skill-chains/dashboard/watch-log.jsonl"
DASHBOARD_LEGACY_LOG_PATH = ROOT / "runtime/skill-chains/dashboard/dedupe/watch-log.jsonl"
LIBRARY_JSON = ROOT / "runtime/skill-chains/dashboard/skills.json"

# Wave-1 skills: their canonical SSOT and the symlinks that should point to them
SSOT_ROOT = Path("/Users/yumei/.agents/skills")
ALIAS_ROOTS = (
    Path("/Users/yumei/.codex/skills"),
    Path("/Users/yumei/.config/opencode/skills"),
    Path("/Users/yumei/.claude/skills"),
)
WAVE1_SKILLS = (
    "analyze",
    "goal-driven-execution",
    "goal-refactor",
    "overnight-goal-runner",
    "plan",
    "release-readiness-runner",
    "test-driven-driver",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    h = hashlib.sha256()
    try:
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def check_skill(skill: str) -> Dict[str, Any]:
    ssot_dir = SSOT_ROOT / skill
    ssot_md = ssot_dir / "SKILL.md"
    ssot_sha = sha256_file(ssot_md)
    record: Dict[str, Any] = {
        "skill": skill,
        "ssot_path": str(ssot_md),
        "ssot_present": ssot_md.exists(),
        "ssot_sha256": ssot_sha,
        "aliases": [],
        "anomalies": [],
    }
    if not ssot_md.exists():
        record["anomalies"].append({"kind": "ssot_missing", "path": str(ssot_md)})

    for root in ALIAS_ROOTS:
        alias = root / skill
        if not alias.exists() and not alias.is_symlink():
            # alias not present at this root — that may be expected
            continue
        info: Dict[str, Any] = {
            "path": str(alias),
            "is_symlink": alias.is_symlink(),
        }
        if alias.is_symlink():
            try:
                target_raw = os.readlink(alias)
                resolved = (alias.parent / target_raw).resolve() if not Path(target_raw).is_absolute() else Path(target_raw).resolve()
                info["target"] = str(resolved)
                info["points_to_ssot"] = (resolved == ssot_dir.resolve())
                if not info["points_to_ssot"]:
                    record["anomalies"].append({
                        "kind": "alias_points_elsewhere",
                        "alias": str(alias),
                        "target": str(resolved),
                        "expected": str(ssot_dir),
                    })
            except Exception as exc:
                info["readlink_error"] = str(exc)
                record["anomalies"].append({"kind": "readlink_error", "alias": str(alias), "error": str(exc)})
        else:
            # not a symlink anymore — reverted!
            record["anomalies"].append({
                "kind": "alias_is_real_dir_or_file",
                "path": str(alias),
                "note": "expected symlink to SSOT after wave 1",
            })
            # also capture sha if it's a file path (or SKILL.md if it's a dir)
            md_in_alias = alias / "SKILL.md" if alias.is_dir() else alias
            sha_alias = sha256_file(md_in_alias)
            info["sha256"] = sha_alias
            if sha_alias and ssot_sha and sha_alias != ssot_sha:
                record["anomalies"].append({
                    "kind": "alias_content_drift",
                    "path": str(md_in_alias),
                    "expected_sha256": ssot_sha,
                    "actual_sha256": sha_alias,
                })

        record["aliases"].append(info)
    return record


def check_library_summary() -> Dict[str, Any]:
    if not LIBRARY_JSON.exists():
        return {"present": False}
    try:
        d = json.loads(LIBRARY_JSON.read_text(encoding="utf-8"))
        return {
            "present": True,
            "summary": d.get("summary", {}),
            "generated_at": d.get("generated_at"),
        }
    except Exception as exc:
        return {"present": True, "parse_error": str(exc)}


def take_snapshot() -> Dict[str, Any]:
    skills = [check_skill(s) for s in WAVE1_SKILLS]
    total_anomalies = sum(len(s["anomalies"]) for s in skills)
    library = check_library_summary()
    return {
        "ts": utc_now(),
        "anomalies_total": total_anomalies,
        "library_summary": library.get("summary"),
        "library_generated_at": library.get("generated_at"),
        "skills": skills,
    }


def append_log(snapshot: Dict[str, Any]) -> None:
    line = json.dumps(snapshot, ensure_ascii=False) + "\n"
    for path in (LOG_PATH, DASHBOARD_LOG_PATH, DASHBOARD_LEGACY_LOG_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(line)


def read_log() -> List[Dict[str, Any]]:
    if not LOG_PATH.exists():
        return []
    out: List[Dict[str, Any]] = []
    with LOG_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def cmd_once() -> int:
    snap = take_snapshot()
    append_log(snap)
    if snap["anomalies_total"] == 0:
        print(f"OK  {snap['ts']}  no anomalies  unique_skills={snap['library_summary'].get('unique_skills') if snap['library_summary'] else '?'}")
        return 0
    print(f"WARN  {snap['ts']}  anomalies={snap['anomalies_total']}", file=sys.stderr)
    for s in snap["skills"]:
        for a in s["anomalies"]:
            print(f"  ! {s['skill']}: {a}", file=sys.stderr)
    return 1


def cmd_analyze() -> int:
    log = read_log()
    if not log:
        print("no snapshots yet")
        return 0
    print(f"snapshots: {len(log)}")
    print(f"first: {log[0]['ts']}")
    print(f"last:  {log[-1]['ts']}")
    anomaly_counts = [s["anomalies_total"] for s in log]
    print(f"anomalies per snapshot: min={min(anomaly_counts)} max={max(anomaly_counts)} avg={sum(anomaly_counts)/len(anomaly_counts):.2f}")
    # SSOT sha drift detection across snapshots
    ssot_history: Dict[str, List[str]] = {}
    for snap in log:
        for s in snap["skills"]:
            sha = s.get("ssot_sha256")
            if sha is None:
                continue
            ssot_history.setdefault(s["skill"], []).append(sha)
    drift = []
    for skill, shas in ssot_history.items():
        unique = list(dict.fromkeys(shas))
        if len(unique) > 1:
            drift.append((skill, unique))
    if drift:
        print("\n⚠️  SSOT content drift detected during observation window:")
        for skill, unique in drift:
            print(f"  {skill}: {len(unique)} distinct sha256 values: {[u[:12] for u in unique]}")
    else:
        print("\nSSOT sha256 stable across all snapshots ✓")
    # latest issues
    latest = log[-1]
    if latest["anomalies_total"] > 0:
        print(f"\nlatest anomalies ({latest['ts']}):")
        for s in latest["skills"]:
            for a in s["anomalies"]:
                print(f"  - {s['skill']}: {a}")
    return 0


def cmd_diff() -> int:
    log = read_log()
    if len(log) < 2:
        print("need at least 2 snapshots to diff")
        return 0
    a, b = log[-2], log[-1]
    print(f"prev: {a['ts']}  anomalies={a['anomalies_total']}")
    print(f"curr: {b['ts']}  anomalies={b['anomalies_total']}")
    a_lib = a.get("library_summary") or {}
    b_lib = b.get("library_summary") or {}
    for k in sorted(set(a_lib) | set(b_lib)):
        if a_lib.get(k) != b_lib.get(k):
            print(f"  library_summary.{k}: {a_lib.get(k)} → {b_lib.get(k)}")
    # per-skill sha changes
    a_shas = {s["skill"]: s.get("ssot_sha256") for s in a["skills"]}
    b_shas = {s["skill"]: s.get("ssot_sha256") for s in b["skills"]}
    for skill in WAVE1_SKILLS:
        if a_shas.get(skill) != b_shas.get(skill):
            print(f"  ⚠️  {skill} ssot sha changed: {(a_shas.get(skill) or '?')[:12]} → {(b_shas.get(skill) or '?')[:12]}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Watch wave-1 skill SSOT integrity")
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--once", action="store_true", help="Append snapshot and exit (default)")
    g.add_argument("--analyze", action="store_true", help="Print trend over all snapshots")
    g.add_argument("--diff", action="store_true", help="Diff last two snapshots")
    args = parser.parse_args()

    if args.analyze:
        return cmd_analyze()
    if args.diff:
        return cmd_diff()
    return cmd_once()


if __name__ == "__main__":
    raise SystemExit(main())
