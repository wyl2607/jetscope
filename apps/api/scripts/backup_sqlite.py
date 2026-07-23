"""Create a consistent local SQLite backup for JetScope recovery drills."""

from __future__ import annotations

import argparse

from app.db.sqlite import DEFAULT_DB_PATH, backup_sqlite_database


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", default=DEFAULT_DB_PATH, help="SQLite database path")
    parser.add_argument("--backup-dir", default="/opt/jetscope/backups", help="Backup destination directory")
    args = parser.parse_args()
    print(backup_sqlite_database(args.database, args.backup_dir))


if __name__ == "__main__":
    main()
