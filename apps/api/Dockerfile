FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app ./app
COPY alembic.ini .
COPY migrations ./migrations

# Optional baked curated snapshots (runtime usually mounts host ./data → /app/data)
# Keep dir present so JETSCOPE_CURATED_DIR / volume paths resolve cleanly.
RUN mkdir -p /app/data/curated

ENV PYTHONPATH=/app
ENV SAFVSOIL_APP_ENV=production
ENV JETSCOPE_CURATED_DIR=/app/data/curated

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
