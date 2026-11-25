#!/usr/bin/env bash
# Load the synthetic prod-like dataset into the running UAT database.
#
#   scripts/stack/seed-uat.sh 'uat-password'
#
# The password is hashed with bcrypt cost 10, the same as apps/api/src/auth.ts,
# so uat1..uat4@example.test can log in to the UAT stack.
set -euo pipefail

password="${1:?usage: seed-uat.sh <demo password for uat1..uat4@example.test>}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="${UAT_POSTGRES_CONTAINER:-kaneo-uat-postgres-1}"

if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "container $container not found — run scripts/stack/up.sh uat first" >&2
  exit 1
fi

# apps/api is where bcryptjs is installed; the api uses cost 10 (auth.ts).
hash="$(cd "$root" && node -e '
  const bcrypt = require(require.resolve("bcryptjs", { paths: [process.cwd() + "/apps/api"] }));
  process.stdout.write(bcrypt.hashSync(process.argv[1], 10));
' "$password")"

docker exec -i "$container" psql -U kaneo -d kaneo -q -v ON_ERROR_STOP=1 -v pw="$hash" \
  <"$root/scripts/stack/seed-uat.sql"
