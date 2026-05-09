#!/usr/bin/env python3
"""Rollback an Obsidian cleanup manifest.

The script reads a cleanup manifest produced by `obsidian_vault_cleanup_apply.py`
and moves files/directories from target paths back to source paths in reverse
order. By default it runs as a dry run; pass `--apply` to perform the moves.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def load_moves(manifest: Path) -> list[dict]:
    rows = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [row for row in rows if row.get("type") == "move" and row.get("status") == "moved"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    moves = load_moves(args.manifest)
    dry_run = not args.apply
    restored = 0
    skipped = 0
    for row in reversed(moves):
        source = Path(row["source_abs"])
        target = Path(row["target_abs"])
        if not target.exists():
            skipped += 1
            print(f"SKIP missing target: {target}")
            continue
        if source.exists():
            skipped += 1
            print(f"SKIP source already exists: {source}")
            continue
        print(f"{'WOULD ' if dry_run else ''}RESTORE {target} -> {source}")
        if not dry_run:
            source.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(source))
        restored += 1
    print(f"restored={restored} skipped={skipped} dry_run={dry_run}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
