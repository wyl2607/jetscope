#!/usr/bin/env python3
"""Apply the first low-risk Obsidian cleanup batch.

This script moves only clearly recoverable clutter:
- nested archived vault copies that are currently visible in the live graph
- root-level migration/sync reports
- byte-identical duplicate candidates from the latest audit

Nothing is deleted. Every move is recorded in a JSONL manifest.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import json
import os
import shutil
from pathlib import Path


VISIBLE_ARCHIVE_DIRS = [
    "3-TECHNICAL/Documentation/Unified/archived_local_Obsidian Vault-20260414-152625",
]

ROOT_MIGRATION_REPORTS = {
    "Migration Summary.md",
    "Obsidian_Setup_Instructions.md",
    "Obsidian单库归档记录-2026-04-14.md",
    "Obsidian双库合并记录-2026-04-14.md",
    "Obsidian双库融合与重建SOP.md",
    "Personal Knowledge Migration Plan.md",
    "asset_sync_report.md",
    "full_export_report.md",
    "iCloud_Migration_Complete.md",
    "migration_report.md",
    "notion_resync_report.md",
    "notion_resync_report 2.md",
    "obsidian_structure_analysis.md",
    "sync_consistency_report.md",
    "🎉 Project Complete - Obsidian Integration.md",
}

ARCHIVE_PATTERNS = (
    "archived_local_Obsidian Vault-",
    "merged_local_2026_04_14",
    "_merged_from_local_2026-04-14",
    "_Recovered_All_",
    "/Inbox-Imports/",
)

IGNORE_PATTERNS = [
    ".obsidian-repair-backups/**",
    ".cleanup-manifests/**",
]


@dataclasses.dataclass
class Move:
    reason: str
    source_rel: str
    target_rel: str
    keep_rel: str = ""


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def now_stamp() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S")


def rel_exists(vault: Path, rel: str) -> bool:
    return (vault / rel).exists()


def unique_target(vault: Path, rel: str) -> str:
    target = vault / rel
    if not target.exists():
        return rel
    stem = target.stem
    suffix = target.suffix
    parent = target.parent
    index = 2
    while True:
        candidate = parent / f"{stem}__{index}{suffix}"
        if not candidate.exists():
            return candidate.relative_to(vault).as_posix()
        index += 1


def dedupe_rank(path: str) -> tuple[int, int, str]:
    archive_penalty = 5 if any(pattern in path for pattern in ARCHIVE_PATTERNS) else 0
    inbox_penalty = 3 if path.startswith("0-INBOX/") or path.startswith("Notes/") else 0
    canonical_bonus = -2 if path.startswith(("01 - Academic & Research/", "04 - Technical Knowledge/", "05 - Administrative/")) else 0
    root_penalty = 2 if "/" not in path else 0
    return (archive_penalty + inbox_penalty + root_penalty + canonical_bonus, len(path), path)


def build_moves(vault: Path, audit: dict, stamp: str) -> list[Move]:
    moves: list[Move] = []
    cleanup_root = f".obsidian-repair-backups/cleanup-{stamp}"

    for rel in VISIBLE_ARCHIVE_DIRS:
        if rel_exists(vault, rel):
            moves.append(
                Move(
                    reason="visible-nested-archive-dir",
                    source_rel=rel,
                    target_rel=f"{cleanup_root}/visible-archive-dirs/{rel}",
                )
            )

    for filename in sorted(ROOT_MIGRATION_REPORTS):
        if rel_exists(vault, filename):
            moves.append(
                Move(
                    reason="root-migration-report",
                    source_rel=filename,
                    target_rel=f"{cleanup_root}/root-migration-reports/{filename}",
                )
            )

    moved_prefixes = tuple(move.source_rel.rstrip("/") + "/" for move in moves)
    seen_sources = {move.source_rel for move in moves}
    for _, paths in audit.get("duplicate_exact", {}).items():
        existing = [path for path in paths if rel_exists(vault, path)]
        if len(existing) < 2:
            continue
        ranked = sorted(existing, key=dedupe_rank)
        keep = ranked[0]
        for duplicate in ranked[1:]:
            if duplicate in seen_sources:
                continue
            if duplicate.startswith(moved_prefixes):
                continue
            target_rel = f"{cleanup_root}/duplicate-candidates/{duplicate}"
            moves.append(
                Move(
                    reason="exact-duplicate-candidate",
                    source_rel=duplicate,
                    target_rel=target_rel,
                    keep_rel=keep,
                )
            )
            seen_sources.add(duplicate)

    return moves


def write_manifest_header(manifest: Path, vault: Path, stamp: str, dry_run: bool, moves: list[Move]) -> None:
    manifest.parent.mkdir(parents=True, exist_ok=True)
    header = {
        "type": "header",
        "stamp": stamp,
        "vault": str(vault),
        "dry_run": dry_run,
        "move_count": len(moves),
        "created_at": dt.datetime.now().isoformat(timespec="seconds"),
    }
    manifest.write_text(json.dumps(header, ensure_ascii=False) + "\n", encoding="utf-8")


def append_manifest(manifest: Path, item: dict) -> None:
    with manifest.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(item, ensure_ascii=False) + "\n")


def apply_moves(vault: Path, moves: list[Move], manifest: Path, dry_run: bool) -> tuple[int, int]:
    moved = 0
    skipped = 0
    for move in moves:
        source = vault / move.source_rel
        if not source.exists():
            skipped += 1
            append_manifest(
                manifest,
                {
                    "type": "move",
                    "status": "skipped-missing-source",
                    **dataclasses.asdict(move),
                },
            )
            continue
        target_rel = unique_target(vault, move.target_rel)
        target = vault / target_rel
        append_manifest(
            manifest,
            {
                "type": "move",
                "status": "planned" if dry_run else "moved",
                "source_abs": str(source),
                "target_abs": str(target),
                **dataclasses.asdict(move),
                "target_rel": target_rel,
            },
        )
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(target))
        moved += 1
    return moved, skipped


def update_ignored_files(vault: Path, manifest: Path, dry_run: bool) -> bool:
    app_json = vault / ".obsidian/app.json"
    if not app_json.exists():
        append_manifest(manifest, {"type": "app-json", "status": "skipped-missing"})
        return False
    data = load_json(app_json)
    ignored = data.setdefault("ignoredFiles", [])
    before = list(ignored)
    changed = False
    for pattern in IGNORE_PATTERNS:
        if pattern not in ignored:
            ignored.append(pattern)
            changed = True
    append_manifest(
        manifest,
        {
            "type": "app-json",
            "status": "planned" if dry_run and changed else ("updated" if changed else "unchanged"),
            "path": str(app_json),
            "added_patterns": [pattern for pattern in IGNORE_PATTERNS if pattern not in before],
        },
    )
    if changed and not dry_run:
        app_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def write_summary(output_dir: Path, stamp: str, dry_run: bool, moves: list[Move], moved: int, skipped: int) -> Path:
    summary = output_dir / f"cleanup-summary-{stamp}.md"
    counts: dict[str, int] = {}
    for move in moves:
        counts[move.reason] = counts.get(move.reason, 0) + 1
    lines = [
        "# Obsidian Cleanup Summary",
        "",
        f"- stamp: `{stamp}`",
        f"- dry_run: `{dry_run}`",
        f"- planned_or_moved: `{moved}`",
        f"- skipped: `{skipped}`",
        "",
        "## Counts",
        "",
    ]
    for reason, count in sorted(counts.items()):
        lines.append(f"- {reason}: {count}")
    lines.extend(["", "## First 60 Moves", ""])
    for move in moves[:60]:
        keep = f"; keep `{move.keep_rel}`" if move.keep_rel else ""
        lines.append(f"- {move.reason}: `{move.source_rel}` -> `{move.target_rel}`{keep}")
    summary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vault", type=Path)
    parser.add_argument("audit_json", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("/Users/yumei/obsidian-audit-output"))
    parser.add_argument("--stamp", default=now_stamp())
    parser.add_argument("--apply", action="store_true", help="Actually move files. Without this flag, only writes a dry-run manifest.")
    args = parser.parse_args()

    vault = args.vault.expanduser().resolve()
    audit = load_json(args.audit_json)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest = args.output_dir / f"cleanup-manifest-{args.stamp}.jsonl"
    moves = build_moves(vault, audit, args.stamp)
    dry_run = not args.apply
    write_manifest_header(manifest, vault, args.stamp, dry_run, moves)
    update_ignored_files(vault, manifest, dry_run)
    moved, skipped = apply_moves(vault, moves, manifest, dry_run)
    summary = write_summary(args.output_dir, args.stamp, dry_run, moves, moved, skipped)
    print(f"Manifest: {manifest}")
    print(f"Summary: {summary}")
    print(f"Moves planned/executed: {moved}; skipped: {skipped}; dry_run={dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
