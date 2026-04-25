from pathlib import Path

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


def apply_schema_bootstrap(engine: Engine) -> str:
    mode = settings.schema_bootstrap_mode.strip().lower()

    if mode == "create_all":
        # Compatibility fallback for local bring-up and ephemeral test DBs.
        Base.metadata.create_all(bind=engine)
        return "create_all"

    if mode == "alembic":
        command.upgrade(_alembic_config(), "head")
        return "alembic"

    raise RuntimeError(f"Unsupported JETSCOPE_SCHEMA_BOOTSTRAP_MODE: {settings.schema_bootstrap_mode}")
