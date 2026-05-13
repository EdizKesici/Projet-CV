# ============================================================
# LuxTalent CV Pre-Screening API — Dockerfile
# ============================================================

FROM python:3.11-slim

# --- System dependencies ---
# ADDED 'curl' so the Docker healthcheck works properly
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# --- Working directory ---
WORKDIR /app

# --- Install Python dependencies ---
# Copy requirements first to leverage Docker layer caching
COPY src/python/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# --- Copy application source ---
COPY src/python/ ./src/python/

# --- Create data directories expected by the app ---
# These will be overridden by volume mounts in production,
# but must exist for the container to start cleanly.
RUN mkdir -p /app/data/input_CVs \
             /app/data/processed_CVs \
             /app/src/python/ml/model

# --- Environment defaults ---
ENV INBOX_DIR=/app/data/input_CVs
ENV PROCESSED_DIR=/app/data/processed_CVs
ENV PYTHONUNBUFFERED=1
# REMOVED PYTHONPATH — The pathlib fix in app.py/watcher.py handles this safely

# --- Expose API port ---
EXPOSE 8000

# --- Start with Gunicorn (production WSGI server) ---
CMD ["gunicorn", \
     "--workers", "2", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "src.python.app:app"]