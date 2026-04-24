#!/usr/bin/env python3
"""
Generate OpenAPI schema from the FastAPI app without running the server.
Handles import path setup and sets safe dummy environment variables.
"""
import json
import os
import sys
import traceback
from pathlib import Path

# Ensure the parent directory (apps/api) is on sys.path so 'app' is importable.
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

# Provide sensible defaults for any settings that may be required at import time.
# The app uses pydantic-settings with defaults, but this guarantees no missing env issues.
os.environ.setdefault("JETSCOPE_DATABASE_URL", "sqlite:///./data/market.db")
os.environ.setdefault("JETSCOPE_ADMIN_TOKEN", "dev-admin-token-change-me")
os.environ.setdefault("JETSCOPE_API_PREFIX", "/v1")


def main() -> int:
    try:
        from app.main import app  # noqa: F401
    except Exception as exc:
        print(f"Failed to import FastAPI app: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    try:
        schema = app.openapi()
    except Exception as exc:
        print(f"Failed to generate OpenAPI schema: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    output_path = SCRIPT_DIR / "openapi.json"
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except Exception as exc:
        print(f"Failed to write OpenAPI schema to {output_path}: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1

    route_count = len(schema.get("paths", {}))
    print(f"OpenAPI schema written to {output_path} ({route_count} paths)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
