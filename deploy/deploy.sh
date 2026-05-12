#!/usr/bin/env bash
# Deploy the Recruiter Tracking Platform on this EC2 host.
#
# Steps:
#   1. git pull   on the current branch
#   2. docker build  (multi-stage: frontend + backend in one image)
#   3. swap the running container for the new one, mapping host :80 -> container :8000
#
# This script lives in deploy/ but always runs against the repo root.
# The backend reads secrets from backend/.env (mounted read-only into the container).
# Re-run this script whenever you want to ship the latest commit.
#
# Usage:
#   ./deploy/deploy.sh                  # build & run on host port 80
#   HOST_PORT=8000 ./deploy/deploy.sh   # override host port

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKERFILE="$SCRIPT_DIR/Dockerfile"
IMAGE_NAME="recruiter-tracking"
CONTAINER_NAME="recruiter-tracking"
HOST_PORT="${HOST_PORT:-80}"
CONTAINER_PORT=8000
ENV_FILE="${REPO_DIR}/backend/.env"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO_DIR"

# ── Sanity checks ───────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"
[ -f "$ENV_FILE" ]                 || die "missing $ENV_FILE — backend secrets required"
[ -f "$DOCKERFILE" ]               || die "Dockerfile not found at $DOCKERFILE"

# Use sudo for docker if the current user can't talk to the daemon directly.
# (Privileged ports < 1024 also need root, but docker daemon access is the
# broader constraint — if you're not in the docker group, every call needs sudo.)
DOCKER="docker"
if [ "$(id -u)" -ne 0 ] && ! docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi

# ── 1. Pull latest source ───────────────────────────────────────────────────
log "git pull"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "$BRANCH"
log "now at $(git rev-parse --short HEAD) on $BRANCH"

# ── 2. Build image ──────────────────────────────────────────────────────────
TAG="$(git rev-parse --short HEAD)"
log "building image ${IMAGE_NAME}:${TAG}"
$DOCKER build -f "$DOCKERFILE" -t "${IMAGE_NAME}:${TAG}" -t "${IMAGE_NAME}:latest" "$REPO_DIR"

# ── 3. Swap containers ──────────────────────────────────────────────────────
if $DOCKER ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  log "stopping & removing existing container"
  $DOCKER rm -f "$CONTAINER_NAME" >/dev/null
fi

log "starting container on host port ${HOST_PORT} -> container ${CONTAINER_PORT}"
$DOCKER run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  "${IMAGE_NAME}:${TAG}"

# ── 4. Quick health probe ───────────────────────────────────────────────────
log "waiting for /api/health (up to 30s)"
for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null 2>&1; then
    log "deploy OK — http://<public-ip>:${HOST_PORT}/  (api at /api)"
    exit 0
  fi
  sleep 2
done

log "health probe did not respond in time — recent container logs:"
$DOCKER logs --tail 50 "$CONTAINER_NAME" || true
die "deploy may have failed; investigate with: $DOCKER logs $CONTAINER_NAME"
