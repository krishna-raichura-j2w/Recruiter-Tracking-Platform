#!/usr/bin/env bash
# Deploy the Recruiter Tracking Platform on this EC2 host.
#
# Architecture (single host, two containers managed by docker compose):
#   - app    : the FastAPI image (serves /api + the built SPA), reachable only on
#              the internal docker network on port 8000
#   - caddy  : reverse proxy on host :80 and :443 with an auto-renewing Let's Encrypt
#              cert for mrr-process-tracker.joulestowatts.com -> app:8000
#
# Steps:
#   1. git pull on the current branch
#   2. docker compose build app
#   3. docker compose up -d  (swaps containers)
#   4. health probe (HTTPS first, falls back to HTTP if cert isn't issued yet)
#
# Secrets come from ../backend/.env (mounted by compose).
# Re-run this script whenever you want to ship the latest commit.
#
# Usage:
#   ./deploy/deploy.sh

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$REPO_DIR/backend/.env"
DOMAIN="mrr-process-tracker.joulestowatts.com"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] %s\033[0m\n' "$*" >&2; exit 1; }

cd "$REPO_DIR"

# ── Sanity checks ───────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"
[ -f "$ENV_FILE" ]                || die "missing $ENV_FILE — backend secrets required"
[ -f "$COMPOSE_FILE" ]            || die "compose file not found at $COMPOSE_FILE"

# Use sudo if the current user can't reach the docker daemon directly.
DOCKER="docker"
if [ "$(id -u)" -ne 0 ] && ! docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi
COMPOSE="$DOCKER compose -f $COMPOSE_FILE"

# ── 1. Pull latest source ───────────────────────────────────────────────────
log "git pull"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "$BRANCH"
log "now at $(git rev-parse --short HEAD) on $BRANCH"

# ── 1b. Remove legacy standalone container (from any pre-compose deploy) ────
if $DOCKER ps -a --format '{{.Names}}' | grep -qx "recruiter-tracking"; then
  # If it wasn't created by compose, the compose project label is missing.
  if ! $DOCKER inspect recruiter-tracking --format '{{ index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null | grep -q .; then
    log "removing legacy standalone container recruiter-tracking"
    $DOCKER rm -f recruiter-tracking >/dev/null
  fi
fi

# ── 2. Build app image ──────────────────────────────────────────────────────
log "building app image"
$COMPOSE build app

# ── 3. Bring stack up ───────────────────────────────────────────────────────
log "starting stack (app + caddy)"
$COMPOSE up -d --remove-orphans

# ── 4. Health probe ─────────────────────────────────────────────────────────
log "waiting for /api/health on the public domain (up to 120s — first run includes TLS issuance)"
ok=""
for i in $(seq 1 40); do
  if curl -fsS --max-time 4 "https://${DOMAIN}/api/health" >/dev/null 2>&1; then
    ok="https"; break
  fi
  if curl -fsS --max-time 4 "http://${DOMAIN}/api/health" >/dev/null 2>&1; then
    ok="http"
  fi
  sleep 3
done

if [ "$ok" = "https" ]; then
  log "deploy OK — https://${DOMAIN}/"
  exit 0
fi

if [ "$ok" = "http" ]; then
  log "app is up on HTTP but HTTPS isn't responding yet."
  log "Caddy may still be obtaining the cert. Tail its logs:"
  log "  $DOCKER logs -f recruiter-caddy"
  exit 0
fi

log "health probe failed — recent caddy + app logs:"
$DOCKER logs --tail 40 recruiter-caddy 2>&1 || true
echo
$DOCKER logs --tail 40 recruiter-tracking 2>&1 || true
die "deploy may have failed; investigate the logs above"
