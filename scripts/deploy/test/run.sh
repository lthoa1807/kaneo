#!/usr/bin/env bash
# Behaviour tests for scripts/deploy/vps-deploy.sh.
#
# Each case runs the real deployment script against a fake Docker CLI.
# Tests assert exit status, expected output, and relevant filesystem side
# effects. The fake only answers the commands the script issues; it is not a
# Docker emulator. Real-daemon behaviour is covered by e2e-real-docker.sh.
set -Eeuo pipefail

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEPLOY="$HERE/../vps-deploy.sh"
FAKE_BIN="$HERE/fake-bin"
WORK=$(mktemp -d)
if [ "${KEEP:-0}" = "1" ]; then
  trap 'printf "kept work dir: %s\n" "$WORK"' EXIT
else
  trap 'rm -rf -- "$WORK"' EXIT
fi

pass=0
failed=0

ok() { pass=$((pass + 1)); printf 'PASS  %s\n' "$1"; }
no() { failed=$((failed + 1)); printf 'FAIL  %s: %s\n' "$1" "$2"; }

assert_eq() {
  local name=$1 want=$2 got=$3
  if [ "$want" = "$got" ]; then ok "$name"; else no "$name" "expected [$want], got [$got]"; fi
}

assert_contains() {
  local name=$1 want=$2 file=$3
  if [ ! -f "$file" ]; then
    no "$name" "file does not exist: $file"
  elif grep -qF -- "$want" "$file"; then
    ok "$name"
  else
    no "$name" "missing [$want] in $file"
  fi
}

assert_not_contains() {
  local name=$1 want=$2 file=$3
  if [ ! -f "$file" ]; then
    no "$name" "file does not exist: $file"
  elif grep -qF -- "$want" "$file"; then
    no "$name" "unexpected [$want] in $file"
  else
    ok "$name"
  fi
}

assert_exists() {
  local name=$1 path=$2
  if [ -e "$path" ]; then ok "$name"; else no "$name" "missing $path"; fi
}

assert_absent() {
  local name=$1 path=$2
  if [ -e "$path" ]; then no "$name" "unexpected $path"; else ok "$name"; fi
}

new_case() {
  local dir="$WORK/$1"
  mkdir -p "$dir/state" "$dir/backups"
  cat > "$dir/compose.yml" <<'YAML'
services:
  kaneo:
    image: ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:?KANEO_IMAGE_TAG is required}
YAML
  printf 'POSTGRES_PASSWORD=secret\nKANEO_IMAGE_TAG=sha-aaaaaaaaaaaa\n' > "$dir/.env"
  printf 'sha-999999999999\n' > "$dir/.last_good_image_tag"
  printf '%s\n' "$dir"
}

set_state() {
  local dir=$1
  shift
  local kv
  for kv in "$@"; do
    printf '%s' "${kv#*=}" > "$dir/state/${kv%%=*}"
  done
}

run() {
  local dir=$1
  shift
  local rc=0
  (
    cd "$dir"
    PATH="$FAKE_BIN:$PATH" \
      FAKE_STATE="$dir/state" \
      KANEO_COMPOSE_DIR="$dir" \
      KANEO_BACKUP_DIR="$dir/backups" \
      KANEO_HEALTH_INTERVAL=0 \
      bash "$DEPLOY" "$@"
  ) > "$dir/out" 2>&1 || rc=$?
  printf '%s\n' "$rc" > "$dir/rc"
}

env_tag() { sed -n 's/^KANEO_IMAGE_TAG=//p' "$1/.env"; }
last_good() { cat "$1/.last_good_image_tag" 2>/dev/null || true; }
backup_count() { ls -1 "$1/backups" 2>/dev/null | wc -l | tr -d ' '; }

# ---------------------------------------------------------------- happy path

d=$(new_case happy)
set_state "$d" app_running=1
run "$d" sha-bbbbbbbbbbbb
assert_eq       'happy exit'                0                    "$(cat "$d/rc")"
assert_eq       'happy .env tag'            sha-bbbbbbbbbbbb     "$(env_tag "$d")"
assert_eq       'happy last good'           sha-bbbbbbbbbbbb     "$(last_good "$d")"
assert_eq       'happy backup count'        1                    "$(backup_count "$d")"
assert_contains 'happy rollback target'     'rollback target   : sha-999999999999' "$d/out"
assert_contains 'happy digest logged'       'image digest'       "$d/out"
assert_exists   'happy .env.bak created'    "$d/.env.bak"
assert_eq       'happy .env.bak intact'     'KANEO_IMAGE_TAG=sha-aaaaaaaaaaaa' "$(grep '^KANEO_IMAGE_TAG=' "$d/.env.bak")"

# ------------------------------------------------------------- tag handling

d=$(new_case invalid-tag)
run "$d" bogus
assert_eq       'invalid tag exit'          1                    "$(cat "$d/rc")"
assert_eq       'invalid tag .env untouched' sha-aaaaaaaaaaaa    "$(env_tag "$d")"
assert_eq       'invalid tag no backup'     0                    "$(backup_count "$d")"
assert_absent   'invalid tag no .env.bak'   "$d/.env.bak"

d=$(new_case same-tag)
set_state "$d" app_running=1
run "$d" sha-aaaaaaaaaaaa
assert_eq       'same tag exit'             0                    "$(cat "$d/rc")"
assert_eq       'same tag no backup'        0                    "$(backup_count "$d")"
assert_contains 'same tag message'          'nothing to do'      "$d/out"
assert_eq       'same tag last good unchanged' sha-999999999999  "$(last_good "$d")"
assert_absent   'same tag no env backup'     "$d/.env.bak"

d=$(new_case duplicate-tag)
cat > "$d/.env" <<'ENV'
POSTGRES_PASSWORD=secret
KANEO_IMAGE_TAG=sha-aaaaaaaaaaaa
OTHER_SETTING=value
KANEO_IMAGE_TAG=sha-cccccccccccc
ENV
set_state "$d" app_running=1
run "$d" sha-bbbbbbbbbbbb
assert_eq       'duplicate tag exit'        0                    "$(cat "$d/rc")"
assert_eq       'duplicate tag count'       1                    "$(grep -c '^KANEO_IMAGE_TAG=' "$d/.env")"
assert_eq       'duplicate tag final value' sha-bbbbbbbbbbbb    "$(env_tag "$d")"
assert_eq       'duplicate tag other kept'  1                    "$(grep -c '^OTHER_SETTING=value$' "$d/.env")"
assert_eq       'duplicate tag no stray tag' 0                   "$(grep -c 'sha-cccccccccccc' "$d/.env")"

d=$(new_case force-same-tag)
set_state "$d" app_running=1
run "$d" --force sha-aaaaaaaaaaaa
assert_eq       'force same tag exit'       0                    "$(cat "$d/rc")"
assert_eq       'force same tag backup'     1                    "$(backup_count "$d")"
assert_eq       'force same tag last good'  sha-aaaaaaaaaaaa     "$(last_good "$d")"

# ---------------------------------------------------------- database backup

d=$(new_case dump-fail)
set_state "$d" app_running=1 dump_fail=1
run "$d" sha-bbbbbbbbbbbb
assert_eq       'dump fail exit'            1                    "$(cat "$d/rc")"
assert_eq       'dump fail .env untouched'  sha-aaaaaaaaaaaa    "$(env_tag "$d")"
assert_eq       'dump fail no backup'       0                    "$(backup_count "$d")"
assert_eq       'dump fail no temp files'   0                    "$(ls -A "$d/backups" | grep -c '^\.kaneo-' || true)"

d=$(new_case archive-bad)
i=1
while [ "$i" -le 15 ]; do
  printf 'old backup\n' > "$d/backups/kaneo-old-$(printf '%02d' "$i").dump"
  i=$((i + 1))
done
set_state "$d" app_running=1 archive_bad=1
run "$d" sha-bbbbbbbbbbbb
assert_eq       'archive bad exit'          1                    "$(cat "$d/rc")"
assert_eq       'archive bad .env untouched' sha-aaaaaaaaaaaa   "$(env_tag "$d")"
assert_eq       'archive bad keeps all old backups' 15           "$(backup_count "$d")"
assert_exists   'archive bad keeps oldest'  "$d/backups/kaneo-old-15.dump"
assert_eq       'archive bad no temp files' 0                    "$(ls -A "$d/backups" | grep -c '^\.kaneo-' || true)"

d=$(new_case postgres-missing)
set_state "$d" app_running=1 pg_id=
run "$d" sha-bbbbbbbbbbbb
assert_eq       'postgres missing exit'     1                    "$(cat "$d/rc")"
assert_eq       'postgres missing .env'     sha-aaaaaaaaaaaa    "$(env_tag "$d")"
assert_contains 'postgres missing message'  'postgres container not found' "$d/out"

d=$(new_case postgres-not-ready)
set_state "$d" app_running=1 pg_ready=0
run "$d" sha-bbbbbbbbbbbb
assert_eq       'postgres not ready exit'   1                    "$(cat "$d/rc")"
assert_eq       'postgres not ready .env'   sha-aaaaaaaaaaaa    "$(env_tag "$d")"
assert_contains 'postgres not ready msg'    'did not become ready' "$d/out"

d=$(new_case disk-full)
set_state "$d" app_running=1 avail_bytes=1024
run "$d" sha-bbbbbbbbbbbb
assert_eq       'disk full exit'            1                    "$(cat "$d/rc")"
assert_eq       'disk full .env untouched'  sha-aaaaaaaaaaaa    "$(env_tag "$d")"
assert_eq       'disk full no backup'       0                    "$(backup_count "$d")"

# ------------------------------------------------------------------ pulling

d=$(new_case pull-denied)
set_state "$d" app_running=1 pull_result=denied
run "$d" sha-bbbbbbbbbbbb
assert_eq       'pull denied exit'          1                    "$(cat "$d/rc")"
assert_eq       'pull denied .env updated'  sha-bbbbbbbbbbbb     "$(env_tag "$d")"
assert_eq       'pull denied last good'     sha-999999999999     "$(last_good "$d")"
assert_contains 'pull denied hint'          'docker login ghcr.io' "$d/out"

d=$(new_case up-fail)
set_state "$d" app_running=1 up_fail=1
run "$d" sha-bbbbbbbbbbbb
assert_eq       'up fail exit'              1                    "$(cat "$d/rc")"
assert_eq       'up fail last good'         sha-999999999999     "$(last_good "$d")"

# ------------------------------------------------------------------- health

d=$(new_case unhealthy)
set_state "$d" app_running=1 health=unhealthy
run "$d" sha-bbbbbbbbbbbb
assert_eq       'unhealthy exit'            1                    "$(cat "$d/rc")"
assert_eq       'unhealthy last good'       sha-999999999999     "$(last_good "$d")"
assert_contains 'unhealthy rollback target' 'rollback target : sha-999999999999' "$d/out"
assert_contains 'unhealthy rollback hint'   './deploy sha-999999999999' "$d/out"

d=$(new_case no-healthcheck)
set_state "$d" app_running=1 health=no-healthcheck
run "$d" sha-bbbbbbbbbbbb
assert_eq       'no healthcheck exit'       1                    "$(cat "$d/rc")"
assert_contains 'no healthcheck msg'        'has no healthcheck' "$d/out"

d=$(new_case health-timeout)
set_state "$d" app_running=1 health=starting
run "$d" sha-bbbbbbbbbbbb
assert_eq       'health timeout exit'       1                    "$(cat "$d/rc")"
assert_contains 'health timeout msg'        'timed out'          "$d/out"
assert_eq       'health timeout last good'  sha-999999999999     "$(last_good "$d")"

d=$(new_case last-good-unwritable)
set_state "$d" app_running=1 mktemp_fail=.last_good_image_tag
run "$d" sha-bbbbbbbbbbbb
assert_eq       'last good write exit'      1                    "$(cat "$d/rc")"
assert_eq       'last good write .env updated' sha-bbbbbbbbbbbb  "$(env_tag "$d")"
assert_eq       'last good write keeps old' sha-999999999999     "$(last_good "$d")"
assert_eq       'last good write backup kept' 1                  "$(backup_count "$d")"
assert_contains 'last good write reports failure' 'deployment failed' "$d/out"
assert_eq       'last good write no temp file' 0                 "$(ls -A "$d" | grep -c '^tmp-\.last_good_image_tag' || true)"

# -------------------------------------------------------------- image checks

d=$(new_case digest-missing)
set_state "$d" app_running=1 digest=
run "$d" sha-bbbbbbbbbbbb
assert_eq       'digest missing exit'       1                    "$(cat "$d/rc")"
assert_eq       'digest missing last good'  sha-999999999999     "$(last_good "$d")"
assert_contains 'digest missing msg'        'digest unavailable' "$d/out"

d=$(new_case ref-mismatch)
set_state "$d" app_running=1 config_image=ghcr.io/other/x:sha-bbbbbbbbbbbb
run "$d" sha-bbbbbbbbbbbb
assert_eq       'ref mismatch exit'         1                    "$(cat "$d/rc")"
assert_contains 'ref mismatch msg'          'does not match expected' "$d/out"

d=$(new_case image-id-mismatch)
set_state "$d" app_running=1 image_id=sha256:aaaa container_image_id=sha256:cccc
run "$d" sha-bbbbbbbbbbbb
assert_eq       'image id mismatch exit'    1                    "$(cat "$d/rc")"
assert_contains 'image id mismatch msg'     'image id does not match' "$d/out"

# ---------------------------------------------------------------- .env guard

d=$(new_case crlf)
printf 'POSTGRES_PASSWORD=secret\r\nKANEO_IMAGE_TAG=sha-aaaaaaaaaaaa\r\n' > "$d/.env"
run "$d" sha-bbbbbbbbbbbb
assert_eq       'crlf exit'                 1                    "$(cat "$d/rc")"
assert_contains 'crlf msg'                  'CRLF'               "$d/out"

d=$(new_case symlink)
mv "$d/.env" "$d/real.env"
ln -s real.env "$d/.env"
run "$d" sha-bbbbbbbbbbbb
assert_eq       'symlink exit'              1                    "$(cat "$d/rc")"
assert_contains 'symlink msg'               'symlink'            "$d/out"

# ------------------------------------------------------------------- status

d=$(new_case status)
run "$d" --status
assert_eq       'status exit'               0                    "$(cat "$d/rc")"
assert_contains 'status configured'         'configured     : sha-aaaaaaaaaaaa' "$d/out"
assert_contains 'status last good'          'last known good: sha-999999999999' "$d/out"
assert_contains 'status rollback target'    'rollback target: sha-999999999999' "$d/out"

d=$(new_case status-bootstrap)
printf 'POSTGRES_PASSWORD=secret\n' > "$d/.env"
run "$d" --status
assert_eq       'status bootstrap exit'     0                    "$(cat "$d/rc")"
assert_contains 'status bootstrap unset'    'configured     : <unset>' "$d/out"

d=$(new_case status-stopped)
set_state "$d" app_running=0
run "$d" --status
assert_eq       'status stopped exit'       0                    "$(cat "$d/rc")"
assert_contains 'status stopped container'  'running        : <stopped container appcid>' "$d/out"
assert_eq       'status stopped .env'       sha-aaaaaaaaaaaa    "$(env_tag "$d")"
assert_eq       'status stopped last good'  sha-999999999999     "$(last_good "$d")"
assert_eq       'status stopped no backup'  0                    "$(backup_count "$d")"

d=$(new_case status-no-container)
set_state "$d" app_running=0 app_id=
run "$d" --status
assert_eq       'status no container exit'  0                    "$(cat "$d/rc")"
assert_contains 'status no container line'  'running        : <no container>' "$d/out"
assert_eq       'status no container .env'  sha-aaaaaaaaaaaa    "$(env_tag "$d")"
assert_eq       'status no container last good' sha-999999999999 "$(last_good "$d")"
assert_eq       'status no container no backup' 0                "$(backup_count "$d")"

# -------------------------------------------------------------------- locks

d=$(new_case lock-held)
set_state "$d" app_running=1
(
  exec 9>"$d/.deploy.lock"
  flock -n 9
  printf 'locked\n' > "$d/lock-ready"
  sleep 5
) &
holder=$!
i=0
while [ ! -f "$d/lock-ready" ] && [ "$i" -lt 100 ]; do
  sleep 0.05
  i=$((i + 1))
done
assert_exists   'lock holder ready'         "$d/lock-ready"
run "$d" sha-bbbbbbbbbbbb
kill "$holder" 2>/dev/null || true
wait "$holder" 2>/dev/null || true
assert_eq       'lock held exit'            1                    "$(cat "$d/rc")"
assert_contains 'lock held msg'             'already running'    "$d/out"
assert_eq       'lock held .env untouched'  sha-aaaaaaaaaaaa    "$(env_tag "$d")"

d=$(new_case concurrent)
set_state "$d" app_running=1 pull_delay=1
(
  cd "$d"
  rc=0
  PATH="$FAKE_BIN:$PATH" FAKE_STATE="$d/state" KANEO_COMPOSE_DIR="$d" \
    KANEO_BACKUP_DIR="$d/backups" KANEO_HEALTH_INTERVAL=0 \
    bash "$DEPLOY" sha-bbbbbbbbbbbb > "$d/out1" 2>&1 || rc=$?
  echo "$rc" > "$d/rc1"
) &
first=$!
(
  cd "$d"
  rc=0
  PATH="$FAKE_BIN:$PATH" FAKE_STATE="$d/state" KANEO_COMPOSE_DIR="$d" \
    KANEO_BACKUP_DIR="$d/backups" KANEO_HEALTH_INTERVAL=0 \
    bash "$DEPLOY" sha-bbbbbbbbbbbb > "$d/out2" 2>&1 || rc=$?
  echo "$rc" > "$d/rc2"
) &
second=$!
wait "$first" "$second" || true
assert_exists 'concurrent rc1 recorded' "$d/rc1"
assert_exists 'concurrent rc2 recorded' "$d/rc2"
wins=0
loser_out=""
if [ "$(cat "$d/rc1")" = "0" ]; then wins=$((wins + 1)); else loser_out="$d/out1"; fi
if [ "$(cat "$d/rc2")" = "0" ]; then wins=$((wins + 1)); else loser_out="$d/out2"; fi
assert_eq 'concurrent exactly one winner' 1 "$wins"
assert_contains 'concurrent loser refused' 'already running' "$loser_out"
assert_eq 'concurrent single backup' 1 "$(backup_count "$d")"

# --------------------------------------------------------------- retention

d=$(new_case retention)
set_state "$d" app_running=1
i=1
while [ "$i" -le 16 ]; do
  touch -d "$i hours ago" "$d/backups/kaneo-old-$(printf '%02d' "$i").dump"
  i=$((i + 1))
done
run "$d" sha-bbbbbbbbbbbb
assert_eq       'retention exit'            0                    "$(cat "$d/rc")"
assert_eq       'retention count'           14                   "$(backup_count "$d")"
assert_exists   'retention keeps new backup' "$(ls -1 "$d"/backups/kaneo-*-sha-bbbbbbbbbbbb.dump)"
assert_exists   'retention keeps newest old' "$d/backups/kaneo-old-01.dump"
assert_absent   'retention drops oldest'    "$d/backups/kaneo-old-16.dump"

# ------------------------------------------------------------------ summary

printf '\n%d passed, %d failed\n' "$pass" "$failed"
[ "$failed" -eq 0 ]
