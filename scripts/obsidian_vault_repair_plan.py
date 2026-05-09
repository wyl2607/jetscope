#!/usr/bin/env python3
"""Generate a dry-run repair plan for an Obsidian vault audit.

This script reads `obsidian_vault_audit.json` and writes proposed file moves,
duplicate handling candidates, and index priorities. It does not modify the
vault. The output is intended to be reviewed before any apply script exists.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path


CANONICAL_ROOTS = {
    "0-INBOX": "00 Inbox",
    "1-ACADEMIC": "01 Academic & Research",
    "2-PROFESSIONAL": "02 Professional & Career",
    "3-TECHNICAL": "03 Technical & AI Systems",
    "4-PERSONAL": "04 Personal Life",
    "5-REFERENCES": "05 References",
    "6-ARCHIVES": "99 Archive",
    "01 - Academic & Research": "01 Academic & Research",
    "02 - Professional Development": "02 Professional & Career",
    "03 - Personal Life": "04 Personal Life",
    "04 - Technical Knowledge": "03 Technical & AI Systems",
    "05 - Administrative": "06 Admin & Documents",
    "06 - Archives": "99 Archive",
    "07 - Imported Inbox": "00 Inbox/Imported",
    "08 - AI Summaries": "03 Technical & AI Systems/AI Summaries",
    "Notes": "00 Inbox/Notes Triage",
}

ARCHIVE_PATTERNS = (
    "archived_local_Obsidian Vault-",
    "merged_local_2026_04_14",
    "_merged_from_local_2026-04-14",
    "_Recovered_All_",
)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def top_root(path: str) -> str:
    return path.split("/", 1)[0] if "/" in path else "(root)"


def normalize_name(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip()
    name = name.replace(":", " -")
    return name


def target_for(path: str) -> tuple[str, str]:
    if any(pattern in path for pattern in ARCHIVE_PATTERNS):
        return "archive-import-artifact", "99 Archive/Import Artifacts/" + path
    root = top_root(path)
    if root == "(root)":
        if path.endswith("_report.md") or "Migration" in path or "migration" in path:
            return "archive-root-report", "99 Archive/Migration Reports/" + normalize_name(path)
        return "root-review", "00 Inbox/Root Review/" + normalize_name(path)
    canonical = CANONICAL_ROOTS.get(root)
    if not canonical:
        return "unknown-root-review", "00 Inbox/Needs Classification/" + normalize_name(path)
    rest = path.split("/", 1)[1] if "/" in path else Path(path).name
    if root == "Notes":
        return "notes-triage", f"{canonical}/{normalize_name(rest)}"
    return "canonical-root", f"{canonical}/{normalize_name(rest)}"


def dedupe_actions(data: dict) -> list[dict[str, str]]:
    actions = []
    for _, paths in data.get("duplicate_normalized", {}).items():
        paths = sorted(paths, key=dedupe_rank)
        keep = paths[0]
        for duplicate in paths[1:]:
            actions.append(
                {
                    "action": "duplicate-candidate",
                    "source": duplicate,
                    "target": f"99 Archive/Duplicate Candidates/{duplicate}",
                    "keep": keep,
                    "reason": "same normalized content hash",
                }
            )
    return actions


def dedupe_rank(path: str) -> tuple[int, int, str]:
    archive_penalty = 5 if any(pattern in path for pattern in ARCHIVE_PATTERNS) else 0
    inbox_penalty = 3 if path.startswith("0-INBOX/") or path.startswith("Notes/") else 0
    root_bonus = -2 if top_root(path) in {"01 - Academic & Research", "04 - Technical Knowledge", "05 - Administrative"} else 0
    return (archive_penalty + inbox_penalty + root_bonus, len(path), path)


def build_actions(data: dict) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []
    seen_sources: set[str] = set()
    for sample_bucket in ("imported_like", "long_filenames", "possible_numbered_duplicates", "no_links"):
        for path in data.get("issue_samples", {}).get(sample_bucket, []):
            if path in seen_sources:
                continue
            seen_sources.add(path)
            kind, target = target_for(path)
            actions.append(
                {
                    "action": "move-candidate",
                    "source": path,
                    "target": target,
                    "keep": "",
                    "reason": f"{sample_bucket}; {kind}",
                }
            )
    for action in dedupe_actions(data):
        if action["source"] not in seen_sources:
            actions.append(action)
            seen_sources.add(action["source"])
    return actions


def write_csv(actions: list[dict[str, str]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["action", "source", "target", "keep", "reason"])
        writer.writeheader()
        writer.writerows(actions)


def write_md(data: dict, actions: list[dict[str, str]], path: Path) -> None:
    counts: dict[str, int] = {}
    for action in actions:
        counts[action["action"]] = counts.get(action["action"], 0) + 1
    lines = [
        "# Obsidian Repair Plan (Dry Run)",
        "",
        "This is a planning artifact only. No vault files were modified.",
        "",
        "## Proposed Operating Model",
        "",
        "- Keep one canonical root set: `00 Inbox`, `01 Academic & Research`, `02 Professional & Career`, `03 Technical & AI Systems`, `04 Personal Life`, `05 References`, `06 Admin & Documents`, `99 Archive`.",
        "- Treat migration reports, imported backups, duplicate candidates, and generated pipeline artifacts as archive material unless they are active notes.",
        "- Triage `Notes/` gradually instead of bulk-moving everything in one pass.",
        "- Resolve duplicates by preserving the shortest non-archive canonical path as the keeper, then moving duplicate candidates to archive after review.",
        "",
        "## Action Counts",
        "",
    ]
    for action, count in sorted(counts.items()):
        lines.append(f"- {action}: {count}")
    lines.extend(["", "## First 80 Proposed Actions", ""])
    for action in actions[:80]:
        keep = f"; keep `{action['keep']}`" if action["keep"] else ""
        lines.append(f"- {action['action']}: `{action['source']}` -> `{action['target']}`{keep}; {action['reason']}")
    lines.extend(
        [
            "",
            "## Repair Phases",
            "",
            "1. Hide or archive nested migration artifacts that are currently visible in graph/search.",
            "2. Build a canonical map for root folders and stop using parallel root taxonomies.",
            "3. Deduplicate normalized-identical files after spot checks.",
            "4. Triage `Notes/` by high-value clusters: language learning, POLIMI/academic, AI/tooling, admin, personal/life.",
            "5. Generate hub notes and MOCs after movement is stable.",
            "",
            "## Guardrails",
            "",
            "- Apply in batches of 50-100 files.",
            "- Write a manifest before each batch.",
            "- Preserve Obsidian wikilinks by updating links after moves or relying on Obsidian link auto-update while the app is open.",
            "- Keep every moved file recoverable under `99 Archive` until the graph is clean.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit_json", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path.cwd() / "obsidian-audit-output")
    args = parser.parse_args()
    data = load(args.audit_json)
    actions = build_actions(data)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "obsidian_repair_plan.json"
    csv_path = args.output_dir / "obsidian_repair_plan.csv"
    md_path = args.output_dir / "obsidian_repair_plan.md"
    json_path.write_text(json.dumps(actions, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(actions, csv_path)
    write_md(data, actions, md_path)
    print(f"Wrote {json_path}")
    print(f"Wrote {csv_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
