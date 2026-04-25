"""SQLite database connection and utilities for local development and backups."""

import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Default SQLite database path
DEFAULT_DB_PATH = os.getenv(
    "JETSCOPE_SQLITE_PATH",
    os.getenv("SAFVSOIL_SQLITE_PATH", "/opt/jetscope/data/market.db"),
)


def ensure_db_dir(db_path: str = DEFAULT_DB_PATH) -> Path:
    """Ensure SQLite database directory exists."""
    db_dir = Path(db_path).parent
    db_dir.mkdir(parents=True, exist_ok=True)
    return Path(db_path)


def create_sqlite_engine(db_path: str = DEFAULT_DB_PATH, check_same_thread: bool = False):
    """Create SQLite engine with optimal settings for local development."""
    db_file = ensure_db_dir(db_path)
    db_url = f"sqlite:///{db_file.absolute()}"
    
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": check_same_thread},
        echo=False,
        future=True,
    )
    return engine


def get_sqlite_session_local(db_path: str = DEFAULT_DB_PATH):
    """Get SQLite sessionmaker."""
    engine = create_sqlite_engine(db_path)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True), engine


def get_sqlite_db(db_path: str = DEFAULT_DB_PATH):
    """Dependency for getting SQLite DB session."""
    SessionLocal, _ = get_sqlite_session_local(db_path)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_backup_path(db_path: str = DEFAULT_DB_PATH, backup_dir: str = "/opt/jetscope/backups") -> str:
    """Generate timestamped backup file path."""
    Path(backup_dir).mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    db_name = Path(db_path).stem
    return os.path.join(backup_dir, f"{db_name}_{timestamp}.db")
