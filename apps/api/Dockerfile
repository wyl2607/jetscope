FROM python:3.13-slim

WORKDIR /app

# Build context is the repository root:
#   docker build -f apps/api/Dockerfile .
# docker-compose.prod.yml uses that same context. Curated JSON lives at
# data/curated, outside apps/api, so an apps/api-only context cannot see it.

COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/app ./app
COPY apps/api/alembic.ini .
COPY apps/api/migrations ./migrations

# curated_events.py checks JETSCOPE_CURATED_DIR first, then /app/data/curated.
# The production SQLite bind mount replaces /app/data, which would hide a copy
# that lived only under that path. /app/curated stays visible with the mount.
# /app/data/curated is the fallback for a container with no mount and no env.
COPY data/curated/ /app/curated/
COPY data/curated/ /app/data/curated/

ENV PYTHONPATH=/app
ENV SAFVSOIL_APP_ENV=production
ENV JETSCOPE_CURATED_DIR=/app/curated

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
