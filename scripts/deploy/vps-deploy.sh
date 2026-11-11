#!/usr/bin/env bash
set -Eeuo pipefail

readonly TAG_PATTERN='^sha-[0-9a-f]{12}$'
readonly HEALTH_ATTEMPTS=30
readonly HEALTH_INTERVAL=5

KANEO_IMAGE_TAG="${KANEO_IMAGE_TAG:-}"
KANEO_COMPOSE_DIR="${KANEO_COMPOSE_DIR:-/opt/kaneo}"

CONTAINER_ID=""
OLD_TAG=""

log() {
  printf '[deploy] %s\n' "$*" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

read_tag() {
  [ -f "$1" ] || return 0
  sed -n 's/^KANEO_IMAGE_TAG=//p' "$1" | head -n 1
}

write_tag_file() {
  local dir=$1 name=$2 value=$3 tmp
  tmp=$(mktemp "$dir/$name.XXXXXX")
  printf '%s\n' "$value" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$dir/$name"
}

container_field() {
  local field=$1 fallback=$2
  docker inspect --format "$field" "$CONTAINER_ID" 2>/dev/null || printf '%s' "$fallback"
}

collect_logs() {
  cd "$KANEO_COMPOSE_DIR" 2>/dev/null || return 0
  local -a cmd=(docker compose)
  if [ -f .env ]; then cmd+=(--env-file .env); fi
  if [ -f .deploy.env ]; then cmd+=(--env-file .deploy.env); fi
  log "Last 200 log lines for service kaneo:"
  "${cmd[@]}" logs --tail=200 kaneo || true
  log "Compose service state:"
  "${cmd[@]}" ps kaneo || true
  if [ -n "$CONTAINER_ID" ]; then
    log "Container inspect:"
    docker inspect "$CONTAINER_ID" || true
  fi
}

on_error() {
  local status=$?
  local line=${BASH_LINENO[0]:-unknown}
  log "Deployment failed (exit ${status}) near line ${line}."
  collect_logs
  if [ -n "$OLD_TAG" ]; then
    log "Rollback target: deploy image tag ${OLD_TAG}"
  fi
  exit "$status"
}

trap on_error ERR

if ! [[ "$KANEO_IMAGE_TAG" =~ $TAG_PATTERN ]]; then
  fail "KANEO_IMAGE_TAG must match sha-<12 lowercase hex>; got '${KANEO_IMAGE_TAG}'"
fi

[ -d "$KANEO_COMPOSE_DIR" ] || fail "compose directory not found: ${KANEO_COMPOSE_DIR}"
cd "$KANEO_COMPOSE_DIR"
[ -w "$KANEO_COMPOSE_DIR" ] || fail "compose directory is not writable: ${KANEO_COMPOSE_DIR}"
[ -f compose.yml ] || fail "compose.yml not found in ${KANEO_COMPOSE_DIR}"

OLD_TAG=$(read_tag .deploy.env)

log "Deploying ${KANEO_IMAGE_TAG} in ${KANEO_COMPOSE_DIR} (previous: ${OLD_TAG:-none})"
write_tag_file "$KANEO_COMPOSE_DIR" .deploy.env "KANEO_IMAGE_TAG=${KANEO_IMAGE_TAG}"

compose_cmd=(docker compose)
if [ -f .env ]; then compose_cmd+=(--env-file .env); fi
compose_cmd+=(--env-file .deploy.env)

"${compose_cmd[@]}" config --quiet
"${compose_cmd[@]}" pull kaneo
"${compose_cmd[@]}" up -d --no-deps kaneo

CONTAINER_ID=$("${compose_cmd[@]}" ps -q kaneo)
[ -n "$CONTAINER_ID" ] || fail "no container found for service kaneo"

log "Waiting up to $((HEALTH_ATTEMPTS * HEALTH_INTERVAL))s for the container to become healthy."
deployed=0
for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
  health=$(container_field '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' missing)
  status=$(container_field '{{.State.Status}}' missing)

  case "$health" in
    healthy)
      deployed=1
      break
      ;;
    starting)
      log "Attempt ${attempt}/${HEALTH_ATTEMPTS}: starting"
      ;;
    unhealthy)
      fail "container reported unhealthy after $((attempt * HEALTH_INTERVAL))s"
      ;;
    no-healthcheck)
      fail "container has no healthcheck; refusing to report success"
      ;;
    *)
      fail "container health could not be determined (${health})"
      ;;
  esac

  [ "$status" = "running" ] || fail "container is not running (state: ${status})"

  sleep "$HEALTH_INTERVAL"
done

[ "$deployed" -eq 1 ] || fail "timed out after $((HEALTH_ATTEMPTS * HEALTH_INTERVAL))s waiting for healthy"

if [ -n "$OLD_TAG" ] && [ "$OLD_TAG" != "$KANEO_IMAGE_TAG" ]; then
  write_tag_file "$KANEO_COMPOSE_DIR" .previous_image_tag "$OLD_TAG"
fi

log "Deployment healthy: ${KANEO_IMAGE_TAG}"
