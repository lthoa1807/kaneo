#!/usr/bin/env bash
# Bring up the production or UAT stack next to the host-native dev environment
# (DEV_RUNBOOK.md). Both stacks refuse to start without RAM to spare, because an
# OOM kill takes down whatever is already serving.
#
#   scripts/stack/up.sh prod
#   scripts/stack/up.sh uat ghcr.io/<owner>/kaneo-fork:sha-<12>
#
# Rollback: same command with the previous image ref, UAT data is kept.
# Tear down: docker compose -p kaneo-uat --env-file .env.uat \
#              -f compose.yml -f compose.uat.yml down
set -euo pipefail

usage="usage: up.sh <prod|uat> [image-ref]"
stack="${1:?$usage}"
image="${2:-}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

case "$stack" in
  # prod takes 5173, so it cannot start while dev web runs on the same port.
  prod) project=kaneo     port=5173 env_file=.env     files=(-f compose.yml) ;;
  uat)  project=kaneo-uat port=5174 env_file=.env.uat files=(-f compose.yml -f compose.uat.yml) ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
min_free_mb="${STACK_MIN_FREE_MB:-1200}"

# A re-deploy of the same project may hold the port; anything else may not.
holder_project="$(docker ps --filter "publish=$port" --format '{{.Label "com.docker.compose.project"}}' | head -1)"
if [ -n "$holder_project" ] && [ "$holder_project" != "$project" ]; then
  echo "port $port is held by compose project '$holder_project', not $project:" >&2
  echo "  docker compose -p $holder_project ps   # stop it first" >&2
  exit 1
fi

if [ -z "$holder_project" ]; then
  holder="$(ss -Hltnp "sport = :$port" 2>/dev/null | head -1 || true)"
  if [ -n "$holder" ]; then
    echo "port $port is already in use, $stack cannot bind it:" >&2
    echo "  $holder" >&2
    echo "stop that process first (kill <its pid>, never pkill node)." >&2
    exit 1
  fi
fi

avail_mb="$(free -m | awk '/^Mem:/{print $7}')"
if [ "${avail_mb:-0}" -lt "$min_free_mb" ]; then
  echo "only ${avail_mb} MiB RAM available, $stack needs ${min_free_mb} MiB free." >&2
  echo "stop what you are not using (docker stop <name>, kill <dev pid>)," >&2
  echo "or set STACK_MIN_FREE_MB if you know the host has more." >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "missing $env_file — copy .env.uat.sample and fill in every secret." >&2
  exit 1
fi

if [ -n "$image" ]; then
  export KANEO_IMAGE="$image"
fi
if [ "$stack" = uat ] && [ -z "${KANEO_IMAGE:-}" ]; then
  echo "uat needs an image ref: up.sh uat ghcr.io/<owner>/kaneo-fork:sha-<12>" >&2
  exit 1
fi

docker compose -p "$project" --env-file "$env_file" "${files[@]}" up -d --pull always

for _ in $(seq 45); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
    echo "$stack is up on :$port (project $project)"
    exit 0
  fi
  sleep 2
done

echo "$stack did not answer /api/health on :$port within 90s" >&2
echo "inspect: docker compose -p $project logs kaneo" >&2
exit 1
