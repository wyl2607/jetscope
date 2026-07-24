from pathlib import Path
from urllib.parse import unquote

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Engine

from app.core.config import settings
from app.db.base import Base


def _alembic_config() -> Config:
    api_root = Path(__file__).resolve().parents[2]
    config = Config(str(api_root / "alembic.ini"))
    config.set_main_option("script_location", str(api_root / "migrations"))
    config.set_main_option("sqlalchemy.url", settings.database_url)
    return config


def _ensure_sqlite_parent_dir(database_url: str) -> None:
    scheme, separator, remainder = database_url.partition("://")
    if not separator or not scheme.startswith("sqlite"):
        return

    path = unquote(remainder.split("?", 1)[0])
    if path.startswith("//"):
        path = path[1:]
    elif path.startswith("/"):
        path = path[1:]

    if not path or path in {":memory:", "/:memory:"} or path.startswith("file:"):
        return

    parent = Path(path).parent
    if parent != Path("."):
        parent.mkdir(parents=True, exist_ok=True)


def _ensure_sqlite_route_tables(engine: Engine) -> None:
    """Create the experimental sqlite_models tables when their routes are enabled.

    The sqlite_models tables (enabled via ``enable_sqlite_routes``) are not part of
    the Alembic migration chain, so ``alembic`` bootstrap mode would otherwise leave
    them missing. Create just those tables here so the feature stays self-consistent.
    Off by default; idempotent (create_all skips existing tables).
    """
    if not settings.enable_sqlite_routes:
        return

    from app.models import sqlite_models  # noqa: F401  (register tables on Base.metadata)

    tables = [
        sqlite_models.MarketPrice.__table__,
        sqlite_models.UserScenario.__table__,
        sqlite_models.MarketAlert.__table__,
        sqlite_models.PriceCache.__table__,
    ]
    Base.metadata.create_all(bind=engine, tables=tables)


def apply_schema_bootstrap(engine: Engine) -> str:
    mode = settings.schema_bootstrap_mode.strip().lower()
    _ensure_sqlite_parent_dir(settings.database_url)

    if mode == "create_all":
        # Compatibility fallback for local bring-up and ephemeral test DBs.
        Base.metadata.create_all(bind=engine)
        return "create_all"

    if mode == "alembic":
        command.upgrade(_alembic_config(), "head")
        _ensure_sqlite_route_tables(engine)
        return "alembic"

    raise RuntimeError(f"Unsupported JETSCOPE_SCHEMA_BOOTSTRAP_MODE: {settings.schema_bootstrap_mode}")
