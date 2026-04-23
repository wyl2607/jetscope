"""PostgreSQL database connection with async support for production."""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

DEFAULT_POSTGRES_URL = os.getenv(
    "SAFVSOIL_POSTGRES_URL",
    settings.database_url,
)


def create_postgres_engine(database_url: str = DEFAULT_POSTGRES_URL):
    """Create PostgreSQL engine with connection pooling for production."""
    engine = create_engine(
        database_url,
        future=True,
        pool_size=8,
        max_overflow=2,
        pool_pre_ping=True,
        pool_recycle=300,
    )
    return engine


def get_postgres_session_local(database_url: str = DEFAULT_POSTGRES_URL):
    """Get PostgreSQL sessionmaker."""
    engine = create_postgres_engine(database_url)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True), engine


def get_postgres_db(database_url: str = DEFAULT_POSTGRES_URL):
    """Dependency for getting PostgreSQL DB session."""
    SessionLocal, _ = get_postgres_session_local(database_url)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
