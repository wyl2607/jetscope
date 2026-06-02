#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[docker-quickstart-smoke] Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "[docker-quickstart-smoke] Missing tool: install Docker Compose (docker compose plugin or docker-compose binary)." >&2
  exit 127
fi

export POSTGRES_PASSWORD="local-placeholder-postgres-password"
export JETSCOPE_ADMIN_TOKEN="local-placeholder-admin-token"

echo "[docker-quickstart-smoke] Validating compose render for infra/docker-compose.yml"
"${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" config >/dev/null

echo "[docker-quickstart-smoke] OK: compose config rendered with local placeholder env values."
