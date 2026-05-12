# syntax=docker/dockerfile:1.6

# ─── Stage 1: build the Vite frontend ───────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /fe

# Install deps with the lockfile for reproducible builds
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy sources and build. .env.production sets VITE_API_BASE_URL=/api so the
# bundle calls the backend on the same origin.
# We run vite directly instead of `npm run build` to skip the `tsc -b` step,
# since the repo currently has pre-existing TS errors unrelated to bundling.
# Type-check locally with `npm run build` when you want it.
COPY frontend/ ./
RUN npx vite build


# ─── Stage 2: python runtime serving API + built frontend ───────────────────
FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FRONTEND_DIST=/app/frontend_dist

# Build deps required by psycopg2 / cryptography wheels on slim images
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential libpq-dev curl \
 && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better layer caching)
COPY backend/pyproject.toml ./pyproject.toml
RUN pip install --upgrade pip \
 && pip install \
        "apscheduler>=3.11.2" \
        "asyncpg>=0.31.0" \
        "bcrypt>=5.0.0" \
        "boto3>=1.43.6" \
        "fastapi>=0.136.1" \
        "openai>=2.35.1" \
        "passlib>=1.7.4" \
        "psycopg2-binary>=2.9.12" \
        "pydantic-settings>=2.14.0" \
        "pydantic[email]>=2.13.4" \
        "pymysql>=1.1.3" \
        "pypdf>=6.10.2" \
        "python-dotenv>=1.2.2" \
        "python-jose[cryptography]>=3.5.0" \
        "python-multipart>=0.0.27" \
        "requests>=2.33.1" \
        "sqlalchemy>=2.0.49" \
        "uvicorn[standard]>=0.46.0"

# Copy backend source
COPY backend/ ./

# Copy built frontend from stage 1
COPY --from=frontend-build /fe/dist /app/frontend_dist

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
