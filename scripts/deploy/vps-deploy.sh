#!/usr/bin/env bash
# Deploy a published Kaneo image tag on the host that runs it.
#
# The script never chooses which version production runs: the operator passes
# the tag. It only makes that change safe by refusing ambiguous state, backing
# up PostgreSQL first, recording what it deployed, and verifying the result.
set -Eeuo pipefail

readonly TAG_PATTERN='^sha-[0-9a-f]{12}$'
# Overridable so the test harness can exercise the timeout path quickly.
readonly HEALTH_ATTEMPTS="${KANEO_HEALTH_ATTEMPTS:-45}"
readonly HEALTH_INTERVAL="${KANEO_HEALTH_INTERVAL:-5}"
readonly BACKUP_RETENTION=14
readonly BACKUP_MIN_FREE_BYTES=$((256 * 1024 * 1024))

KANEO_COMPOSE_DIR="${KANEO_COMPOSE_DIR:-/opt/kaneo}"
KANEO_BACKUP_DIR="${KANEO_BACKUP_DIR:-$HOME/kaneo-backups}"

MODE=deploy
FORCE=0
TARGET_TAG=""
CONTAINER_ID=""
BACKUP_FILE=""
TMP_ENV=""
TMP_DUMP=""
LOCK_FILE=""
RUNNING_REF=""
RUNNING_IMAGE_ID=""
IMAGE_DIGEST=""

log() { printf '[deploy] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

usage() {
  cat <<'EOF'
usage: ./deploy [--status] [--force] <image-tag>

  <image-tag>   sha-<12 hex> tag published by the "Publish main image" workflow
  --status      show configured, running and last known good image; changes nothing
  --force       redeploy even when the tag already matches .env
EOF
}

compose() {
  ( cd "$KANEO_COMPOSE_DIR" && exec docker compose "$@" )
}

read_tag() {
  local file=$1
  [ -f "$file" ] || return 0
  sed -n 's/^KANEO_IMAGE_TAG=//p' "$file" 2>/dev/null | head -n1 | tr -d '\r'
}

read_last_good() {
  local file="$KANEO_COMPOSE_DIR/.last_good_image_tag"
  [ -f "$file" ] || return 0
  head -n1 "$file" 2>/dev/null | tr -d '\r'
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

write_tag_file() {
  local name=$1 value=$2 tmp
  tmp=$(mktemp "./tmp-${name}.XXXXXX")
  printf '%s\n' "$value" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "./$name"
  chmod 600 "./$name"
}

cleanup() {
  if [ -n "$TMP_ENV" ]; then rm -f -- "$TMP_ENV"; fi
  if [ -n "$TMP_DUMP" ]; then rm -f -- "$TMP_DUMP"; fi
  :
}

running_reference() {
  local cid=${CONTAINER_ID:-}

  if [ -z "$cid" ]; then
    cid=$(compose ps -q kaneo 2>/dev/null | head -n1 || true)
  fi
  if [ -z "$cid" ]; then
    cid=$(compose ps -aq kaneo 2>/dev/null | head -n1 || true)
  fi
  [ -n "$cid" ] || return 0

  docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true
}

collect_diagnostics() {
  local configured last_good running cid=${CONTAINER_ID:-}

  if [ -z "$cid" ]; then
    cid=$(compose ps -aq kaneo 2>/dev/null | head -n1 || true)
  fi

  log "--- container state (environment values omitted) ---"
  if [ -n "$cid" ]; then
    docker inspect --format '{{json .State}}' "$cid" 2>/dev/null || true
  else
    log "no container found for service kaneo"
  fi

  log "--- compose service state ---"
  compose ps kaneo 2>/dev/null || true

  log "--- last 200 log lines for service kaneo ---"
  compose logs --tail=200 --no-color kaneo 2>/dev/null || true

  configured=$(read_tag "$KANEO_COMPOSE_DIR/.env")
  last_good=$(read_last_good)
  running=$(running_reference)

  log "--- deployment state ---"
  log "configured      : ${configured:-<unset>}"
  log "running         : ${running:-<none>}"
  log "last known good : ${last_good:-<none>}"
  if [ -n "$last_good" ]; then
    log "rollback target : $last_good"
  else
    log "rollback target : <none>"
  fi
  if [ -n "$BACKUP_FILE" ]; then
    log "database backup : $BACKUP_FILE"
  fi
  if [ -n "$last_good" ]; then
    log "to roll back    : ./deploy $last_good"
  fi
}

on_error() {
  local status=$? line=${BASH_LINENO[0]:-unknown}
  log "deployment failed (exit $status) near line $line"
  collect_diagnostics
  exit "$status"
}

trap on_error ERR
trap cleanup EXIT

show_status() {
  local configured last_good cid newest

  configured=$(read_tag "$KANEO_COMPOSE_DIR/.env")
  last_good=$(read_last_good)

  printf 'compose dir    : %s\n' "$KANEO_COMPOSE_DIR"
  printf 'configured     : %s\n' "${configured:-<unset>}"
  printf 'last known good: %s\n' "${last_good:-<none>}"

  cid=$(compose ps -q kaneo 2>/dev/null | head -n1 || true)
  if [ -z "$cid" ]; then
    cid=$(compose ps -aq kaneo 2>/dev/null | head -n1 || true)
    if [ -n "$cid" ]; then
      printf 'running        : <stopped container %.12s>\n' "$cid"
    else
      printf 'running        : <no container>\n'
    fi
  else
    local running_ref image_id digest
    running_ref=$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true)
    image_id=$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || true)
    digest=""
    if [ -n "$image_id" ]; then
      digest=$(docker image inspect --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' "$image_id" 2>/dev/null || true)
    fi
    printf 'running        : %s\n' "${running_ref:-<unknown>}"
    printf 'running id     : %s\n' "${image_id:-<unknown>}"
    printf 'running digest : %s\n' "${digest:-<unavailable>}"
  fi

  newest=$(ls -1t "$KANEO_BACKUP_DIR"/kaneo-*.dump 2>/dev/null | head -n1 || true)
  printf 'latest backup  : %s\n' "${newest:-<none>}"
  printf 'rollback target: %s\n' "${last_good:-<none>}"
}

preflight_deploy() {
  [ -d "$KANEO_COMPOSE_DIR" ] || fail "compose directory not found: $KANEO_COMPOSE_DIR"
  [ -w "$KANEO_COMPOSE_DIR" ] || fail "compose directory is not writable: $KANEO_COMPOSE_DIR"
  [ -f "$KANEO_COMPOSE_DIR/compose.yml" ] || fail "compose.yml not found in $KANEO_COMPOSE_DIR"
  [ -f "$KANEO_COMPOSE_DIR/.env" ] || fail ".env not found in $KANEO_COMPOSE_DIR"

  if [ -L "$KANEO_COMPOSE_DIR/.env" ]; then
    fail ".env is a symlink; refusing to rewrite it"
  fi
  if [ ! -w "$KANEO_COMPOSE_DIR/.env" ]; then
    fail ".env is not writable"
  fi
  if LC_ALL=C grep -q $'\r' "$KANEO_COMPOSE_DIR/.env"; then
    fail ".env contains CRLF line endings; convert it to LF first"
  fi

  cd "$KANEO_COMPOSE_DIR"
  docker info >/dev/null 2>&1 || fail "docker daemon is not reachable"
}

acquire_lock() {
  LOCK_FILE="$KANEO_COMPOSE_DIR/.deploy.lock"
  if ! exec 9>"$LOCK_FILE"; then
    fail "cannot open lock file: $LOCK_FILE"
  fi
  if ! flock -n 9; then
    fail "another deployment is already running (lock: $LOCK_FILE)"
  fi
}

prune_backups() {
  local dir=$1 f
  local -a stale=()

  mapfile -t stale < <(ls -1t "$dir"/kaneo-*.dump 2>/dev/null | tail -n +$((BACKUP_RETENTION + 1)))

  for f in "${stale[@]:-}"; do
    if [ -z "$f" ] || [ "$f" = "$BACKUP_FILE" ]; then
      continue
    fi
    rm -f -- "$f"
    log "pruned old backup: $f"
  done
}

backup_database() {
  local cid status i stamp prev_size required avail newest

  cid=$(compose ps -q postgres 2>/dev/null | head -n1 || true)
  [ -n "$cid" ] || fail "postgres container not found; refusing to deploy without a database backup"

  status=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo unknown)
  [ "$status" = "running" ] || fail "postgres container is not running (state: $status)"

  for i in $(seq 1 30); do
    if compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      fail "postgres did not become ready within 30s"
    fi
    sleep 1
  done

  mkdir -p "$KANEO_BACKUP_DIR"
  chmod 700 "$KANEO_BACKUP_DIR"

  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  BACKUP_FILE="$KANEO_BACKUP_DIR/kaneo-${stamp}-${TARGET_TAG}.dump"

  newest=$(ls -1t "$KANEO_BACKUP_DIR"/kaneo-*.dump 2>/dev/null | head -n1 || true)
  prev_size=0
  if [ -n "$newest" ]; then
    prev_size=$(stat -c %s "$newest" 2>/dev/null || echo 0)
  fi
  required=$((prev_size * 3))
  if [ "$required" -lt "$BACKUP_MIN_FREE_BYTES" ]; then
    required=$BACKUP_MIN_FREE_BYTES
  fi
  avail=$(df --output=avail -B1 "$KANEO_BACKUP_DIR" | tail -n1)
  if [ "$avail" -lt "$required" ]; then
    fail "insufficient disk in $KANEO_BACKUP_DIR: ${avail}B available, ${required}B required"
  fi

  TMP_DUMP=$(mktemp "$KANEO_BACKUP_DIR/.kaneo-XXXXXX.dump")
  chmod 600 "$TMP_DUMP"

  if ! compose exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$TMP_DUMP"; then
    fail "pg_dump failed"
  fi
  if [ ! -s "$TMP_DUMP" ]; then
    fail "backup file is empty"
  fi
  if ! compose exec -T postgres pg_restore --list < "$TMP_DUMP" >/dev/null; then
    fail "backup archive is not readable"
  fi

  mv "$TMP_DUMP" "$BACKUP_FILE"
  TMP_DUMP=""
  chmod 600 "$BACKUP_FILE"

  prune_backups "$KANEO_BACKUP_DIR"
  log "database backup: $BACKUP_FILE"
}

write_env_tag() {
  local tag=$1 tmp count

  if [ ! -e .env.bak ]; then
    cp -p .env .env.bak
    chmod 600 .env.bak
    log "kept first .env backup: $(pwd)/.env.bak"
  fi

  tmp=$(mktemp ./.env.XXXXXX)
  TMP_ENV=$tmp
  chmod 600 "$tmp"

  awk -v tag="KANEO_IMAGE_TAG=$tag" '
    BEGIN { done = 0 }
    /^[[:space:]]*KANEO_IMAGE_TAG=/ {
      if (!done) { print tag; done = 1 }
      next
    }
    { print }
    END { if (!done) print tag }
  ' .env > "$tmp"

  chmod 600 "$tmp"
  mv "$tmp" .env
  TMP_ENV=""
  chmod 600 .env

  count=$(grep -c '^KANEO_IMAGE_TAG=' .env || true)
  if [ "$count" -ne 1 ]; then
    fail ".env must contain exactly one KANEO_IMAGE_TAG line"
  fi
}

verify_running_image() {
  local expected running_ref expected_id running_image_id digest stopped

  expected=$(compose config --images 2>/dev/null | awk -v tag=":$TARGET_TAG" '
    length($0) >= length(tag) && substr($0, length($0) - length(tag) + 1) == tag
  ')
  [ -n "$expected" ] || fail "cannot determine an image reference for tag $TARGET_TAG"
  if [ "$(printf '%s\n' "$expected" | wc -l)" -ne 1 ]; then
    fail "image reference for tag $TARGET_TAG is ambiguous: $expected"
  fi

  CONTAINER_ID=$(compose ps -q kaneo 2>/dev/null | head -n1 || true)
  if [ -z "$CONTAINER_ID" ]; then
    stopped=$(compose ps -aq kaneo 2>/dev/null | tr '\n' ' ' || true)
    collect_diagnostics
    fail "no running container for service kaneo (containers present: ${stopped:-none})"
  fi

  running_ref=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER_ID")
  if [ "$running_ref" != "$expected" ]; then
    fail "running image '$running_ref' does not match expected '$expected'"
  fi

  expected_id=$(docker image inspect --format '{{.Id}}' "$expected")
  running_image_id=$(docker inspect --format '{{.Image}}' "$CONTAINER_ID")
  if [ "$running_image_id" != "$expected_id" ]; then
    fail "container image id does not match the pulled image"
  fi

  digest=$(docker image inspect --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' "$running_image_id")
  if [ -z "$digest" ]; then
    fail "image digest unavailable; refusing to record an unverifiable deployment"
  fi

  RUNNING_REF=$running_ref
  RUNNING_IMAGE_ID=$running_image_id
  IMAGE_DIGEST=$digest

  log "image reference: $RUNNING_REF"
  log "image digest   : $IMAGE_DIGEST"
}

wait_for_health() {
  local attempt health status

  for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$CONTAINER_ID" 2>/dev/null || echo missing)
    status=$(docker inspect --format '{{.State.Status}}' "$CONTAINER_ID" 2>/dev/null || echo missing)

    case "$health" in
      healthy)
        return 0
        ;;
      starting)
        log "health attempt ${attempt}/${HEALTH_ATTEMPTS}: starting"
        ;;
      unhealthy)
        collect_diagnostics
        fail "container reported unhealthy after $((attempt * HEALTH_INTERVAL))s"
        ;;
      no-healthcheck)
        collect_diagnostics
        fail "container has no healthcheck; refusing to report success"
        ;;
      *)
        collect_diagnostics
        fail "container health could not be determined (${health})"
        ;;
    esac

    if [ "$status" != "running" ]; then
      collect_diagnostics
      fail "container is not running (state: $status)"
    fi

    sleep "$HEALTH_INTERVAL"
  done

  collect_diagnostics
  fail "timed out after $((HEALTH_ATTEMPTS * HEALTH_INTERVAL))s waiting for a healthy container"
}

main() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --status)
        MODE=status
        ;;
      --force)
        FORCE=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      --)
        shift
        [ $# -gt 0 ] || fail "missing image tag"
        TARGET_TAG=$1
        shift
        break
        ;;
      -*)
        fail "unknown option: $1"
        ;;
      *)
        [ -z "$TARGET_TAG" ] || fail "unexpected extra argument: $1"
        TARGET_TAG=$1
        ;;
    esac
    shift
  done

  if [ "$MODE" = "status" ]; then
    show_status
    return 0
  fi

  if [ -z "$TARGET_TAG" ]; then
    usage >&2
    fail "missing image tag"
  fi
  if ! [[ "$TARGET_TAG" =~ $TAG_PATTERN ]]; then
    fail "invalid image tag '${TARGET_TAG}'; expected sha-<12 lowercase hex>"
  fi

  require_cmd docker
  require_cmd flock
  require_cmd awk
  require_cmd mktemp

  preflight_deploy
  acquire_lock

  local configured previous
  configured=$(read_tag .env)
  previous=$(read_last_good)

  if [ "$configured" = "$TARGET_TAG" ] && [ "$FORCE" -ne 1 ]; then
    log "tag $TARGET_TAG is already configured; nothing to do (use --force to redeploy)"
    return 0
  fi

  log "deploying $TARGET_TAG (configured: ${configured:-none}, last known good: ${previous:-none})"

  backup_database
  write_env_tag "$TARGET_TAG"

  if ! compose config --quiet; then
    fail "docker compose config failed after updating .env"
  fi

  local pull_output
  if ! pull_output=$(compose pull kaneo 2>&1); then
    printf '%s\n' "$pull_output" >&2
    case "$pull_output" in
      *unauthorized*|*denied*|*"authentication required"*)
        fail "image pull was denied; run 'docker login ghcr.io -u <user>' as $USER and retry"
        ;;
      *)
        fail "docker compose pull failed"
        ;;
    esac
  fi

  if ! compose up -d --no-deps kaneo; then
    collect_diagnostics
    fail "docker compose up failed"
  fi

  verify_running_image
  wait_for_health

  write_tag_file .last_good_image_tag "$TARGET_TAG"

  local rollback=${previous:-}
  if [ "$rollback" = "$TARGET_TAG" ]; then
    rollback=""
  fi

  log "deployment healthy: $TARGET_TAG"
  log "image digest      : $IMAGE_DIGEST"
  log "last known good   : $TARGET_TAG"
  log "rollback target   : ${rollback:-<none>}"
  log "database backup   : ${BACKUP_FILE:-<none>}"
}

main "$@"
