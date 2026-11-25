# Session learnings: running checks on this WSL checkout

Date: 2026-11-22. Scope: modern color palette work, but the resource limits apply to every session.

## Environment

- WSL machine: ~9.7 GB RAM, 6 vCPU, 4 GB swap.
- Node 24.21.0, pnpm 12.18.0.
- A full `apps/web` Vitest run creates jsdom once per test file and can exhaust the machine before it finishes.

## What went wrong

| Action | Observed result |
| --- | --- |
| Full `apps/web` Vitest suite | 37 jsdom environments, ~460 s of environment setup alone; one run took 17 minutes and was killed by the harness |
| `tsc -p tsconfig.app.json` (TypeScript 7 native) | 4.5 GB RSS, ~190% CPU, no output after 17 minutes; had to be killed. Re-measured 2026-11-24: 4.66 GB RSS and 339% CPU after 52 s, still climbing on a box where k3s, gunicorn and other services already hold ~4 GB, so the run thrashes swap instead of finishing. It ignores SIGTERM; `kill -9` is the only way to stop it and frees ~5 GB. A small package (`packages/libs`) typechecks in seconds, so the size of `apps/web` is the problem, not `tsc` |
| Test + typecheck in parallel | Both slowed down and the test run reported 12 spurious errors; a clean rerun passed |
| `pnpm test` / repo-wide `pnpm lint` | Pre-existing failures in untouched files (596 files flagged by the formatting check), not caused by the change |
| `git stash` without pathspec | Captures unrelated dirty files; use a scoped pathspec instead |
| Branch based on an old fork `main` | Pulled in unrelated commits and a migration-meta conflict; base new work on `upstream/main` |

## Rules

1. Run only the tests that cover the change, with bounded workers:
   `vp test run --maxWorkers=1 <path>` (use `2` at most).
2. Run one heavy job at a time. Do not run tests, typecheck, or builds concurrently. Check `free -h` first; stop if available memory is below ~1.5 GB.
3. Do not run full `pnpm build`, `pnpm test`, or repo-wide `pnpm lint` for a small change. Format and lint only changed files:
   `pnpm exec vp check $(git diff --name-only)`.
4. Avoid package-wide `tsc -p` here. Prefer focused tests; if typecheck is required, run it alone with a timeout and watch its memory. For `apps/web` typechecking, let CI (`.github/workflows/fork-ci.yml`) be the gate and use `pnpm exec vp check` plus focused Vitest runs locally.
5. Only run `pnpm install` when dependencies or the lockfile actually changed, and not while a dev server or tests are running.
6. Keep git operations scoped: `git stash push -u -- <paths>`, explicit `git add <paths>`, and `git diff --stat` before committing.
7. The pre-commit hook runs repo-wide lint. Check changed files first; if the hook fails only on pre-existing files, use `--no-verify` and report why.
8. Base feature branches on `upstream/main` to avoid replaying unrelated local commits and their conflicts.

## Integration tests read built packages, not their sources

`tests/api-integration` resolves `@kaneo/permissions` (and other workspace
packages) from `packages/*/dist`, so a package edit is invisible to a local
integration run until that package is rebuilt. `pnpm --filter
@kaneo/permissions build` aborts on this box (exit 134), so anything touching a
shared package is verified in CI only; a green local run proves nothing there.
Cost so far: one pushed commit whose test asserted the old payload.

## Minimal verification recipes

```bash
# unit tests for one area
cd apps/web
NODE_OPTIONS=--no-experimental-webstorage \
  ../../node_modules/.pnpm/vitest@5.1.0_*/node_modules/vitest/vitest.mjs \
  run --config vitest.config.ts --maxWorkers=1 src/lib/color

# format + lint only the changed files
cd /path/to/repo
pnpm exec vp check $(git diff --name-only)

# i18n key sync (cheap)
pnpm i18n:check
```

## The web app lists workspaces through better-auth, not `/api/workspace`

`apps/web/src/fetchers/workspace/get-workspaces.ts` calls
`authClient.organization.list()`. The dashboard's landing-page decision reads
that list, and `apps/api/src/auth.ts` filters it with
`readableNativeOrganizations()` (workspace:read). Changing
`canReadWorkspace()` / `list-workspaces` does **not** move that redirect — a
guest whose role lacks workspace:read still got `/onboarding` after the first
attempt. Check `/api/auth/organization/list` in the browser when a workspace is
missing from the UI.
