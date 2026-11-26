# Kaneo Dashboard — Implementation Plan (Phase 1)

> Phase: 1 – Architecture and Functional Specification
> Status: Executed through T9. Gates green in CI (run 45868094980); widget tests and the browser pass are recorded in `phase-5-completion-report.md`. Awaiting Gate 5 approval.
> Branch: `feature/ui-development` (already checked out)
> Order matters: API first, then client, then widgets, then gates.

## 0. Execution status (2026-11-26)

| Task | State |
| --- | --- |
| T1 API schema + controllers | Done, with `dashboard-series.ts` + test and a shared `dashboard-task-rows.ts`; no `get-dashboard-summary.test.ts` (SQL fixtures live in the integration test). |
| T2 API routes | Done — `/dashboard` and `/dashboard/tasks`; the drilldown endpoint was added during implementation (`api-contract.md` §1.2). |
| T3 OpenAPI | Done, `apps/docs/openapi.json` has both paths. |
| T4 Fetcher + hook | Done; drilldown fetcher/hook added too. |
| T5 Route + nav + i18n | Done; sidebar icon is `LayoutDashboard`. |
| T6 Widgets | Done with different file names (see `architecture.md` §3); unassigned is a `MetricTile`. Component tests in `apps/web/src/components/dashboard/*.test.tsx` (8 files, 16 tests). |
| T7 States + responsive | Skeleton and per-widget error done; browser pass recorded 2026-11-27 at 320/768/1280/1536 px in light, dark and `modern` (see `phase-5-completion-report.md`). |
| T8 Integration | Done (`tests/api-integration/dashboard-summary.test.ts`) for 401/403, done/archived and project scope; no 51-row truncation fixture. Drilldown filters and 400 are covered by `dashboard-drilldown.test.ts`. |
| T9 Gates + report | Gates green in CI (run 45868094980: lint, i18n, openapi, typecheck, build, integration); report written to `phase-5-completion-report.md`. |

## 1. Preconditions

- Phase 0 approved (Plannotator: "no changes requested").
- No dependency added; no schema change; Home page untouched.
- Work stays inside `apps/api/src/workspace/**`, `apps/web/**`, `i18n/**`,
  `apps/docs/openapi.json`, `docs/dashboard/**`.

## 2. Tasks

### T1 — API: schema and controller

Files:

- `apps/api/src/workspace/schema.ts` — add `workspaceDashboardSchema`,
  `dashboardTaskSchema`, `dashboardBucketSchema`, `dashboardTaskCountsSchema`,
  `dashboardChartsSchema` (see `api-contract.md` §2).
- `apps/api/src/workspace/controllers/get-dashboard-summary.ts` — new;
  bucket rows plus `count(...).filter(...)` aggregates, joining `project` and
  `user`, applying `projectAccessCondition`. One query per aggregate group,
  capped at 50 rows per bucket.
- `apps/api/src/workspace/controllers/dashboard-task-rows.ts` — new; the one
  scope (`dashboardTaskWhere`) and ordering shared by counts and drilldown.
- `apps/api/src/workspace/controllers/get-dashboard-task-drilldown.ts` — new;
  one bucket behind a chart segment (see `api-contract.md` §1.2).
- `apps/api/src/workspace/dashboard-series.ts` — new; fixed priority order, UTC
  day series, 50-row cap, `toBucket`.
- `apps/api/src/workspace/dashboard-series.test.ts` — new; series helpers,
  truncation and day edges.

Verify: `pnpm --dir apps/api exec vp test run --config vitest.config.ts src/workspace/dashboard-series.test.ts`. Open/done/archived
rows, null `dueDate`, project scope and guest 403 are covered by
`tests/api-integration/dashboard-summary.test.ts`.

### T2 — API: route

File: `apps/api/src/workspace/index.ts` — two `createRoute` calls, both with
`workspaceAccess.fromParam("workspaceId")` +
`requireWorkspacePermission({ project: ["read"], task: ["read"] })`:
`/dashboard` (`workspaceDashboardSchema`) and `/dashboard/tasks`
(`dashboardBucketSchema`, filters in `api-contract.md` §1.2).

Verify: integration test asserts 403 for a caller without `task:read` and 200
for a member (T8).

### T3 — OpenAPI gate

Run `pnpm openapi:check:fix`. Commit `apps/docs/openapi.json` with the route
change. Verify `pnpm openapi:check` passes.

### T4 — Web: fetcher and hook

Files:

- `apps/web/src/fetchers/dashboard/get-dashboard-summary.ts`
- `apps/web/src/fetchers/dashboard/get-dashboard-task-drilldown.ts`
- `apps/web/src/hooks/queries/dashboard/use-get-dashboard-summary.ts`
  — key `["dashboard", workspaceId]`, `enabled: ready && staffNav`,
  `refetchInterval: 30_000`, `refetchOnWindowFocus: "always"`.
- `apps/web/src/hooks/queries/dashboard/use-get-dashboard-drilldown.ts`
- `apps/web/src/hooks/queries/dashboard/use-get-dashboard-summary.test.tsx` —
  disabled for guests, correct key, no fetch when disabled.

Verify: `pnpm --dir apps/web exec vp test run --config vitest.config.ts src/hooks/queries/dashboard`.

### T5 — Web: route and navigation

Files:

- `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/overview.tsx`
  — reads `workspaceId`, gates on `ready && staffNav`, renders the page.
- `apps/web/src/components/nav-main.tsx` — one `NavItem` after Home.
- `i18n/en-US.json` — `navigation:sidebar.overview` + `dashboard.*` keys from
  `functional-spec.md` §7; then `pnpm i18n:check:fix`.

Verify: `pnpm i18n:check`; dev server shows the sidebar item and the URL
renders without touching Home.

### T6 — Web: widgets

Files under `apps/web/src/components/dashboard/` (one per file, tests beside):

`widget-card.tsx`, `widget-error.tsx`, `metric-tile.tsx`, `deadline-risk.tsx`,
`priority-donut.tsx`, `due-load-chart.tsx`, `project-load-chart.tsx`,
`intake-queue.tsx`, `task-drilldown.tsx`, `dashboard-skeleton.tsx`, `types.ts`.
The unassigned count is a `MetricTile` in the top grid.

Rules:

- Values formatted with the existing locale helpers (`useLocale`, `formatDate`).
- Progress bars use native `<progress>`; percentage text is visible.
- Every task-backed number, legend row, column and project bar is a `<button>`
  that opens `TaskDrilldown` with the bucket from the payload. No client-side
  re-filter of a 100-row task list.
- `TaskDrilldown` is a native `<dialog>` with `showModal()`; do not add
  `role="dialog"`, `aria-modal`, a focus trap or an `Esc` handler.
- No footer link: My Tasks is assignment-scoped and no other view accepts these
  task filters, so the footer only reports truncation.
- No new dependency, no canvas, no chart library.

Verify: focused component tests for value/zero/error/aria, and a drilldown test
asserting the row count equals `items.length` and the truncated footer.

### T7 — Web: page states and responsive pass

Files: `dashboard-skeleton.tsx`, `widget-error.tsx`, the route component.

- Skeleton mirrors the real grid so no layout shift on first paint.
- Each widget owns its error state; one failing query does not blank the page.
- Check 320 / 768 / 1280 / 1536 px, light + dark + `modern`, in the browser.
- `prefers-reduced-motion`: no animation is added, so nothing to gate.

### T8 — Integration and authorization

Files: `tests/api-integration/dashboard-summary.test.ts`:

- guest → 403;
- member limited to project A → counts only project A's tasks;
- owner → counts every readable project;
- archived project and `done` task do not contribute.

Run the focused integration file against PostgreSQL (CI if local memory is
thin, per repo AGENTS.md).

### T9 — Gates and report

Run, scoped: `pnpm --filter @kaneo/api typecheck`,
`pnpm --dir apps/web exec vp test run --config vitest.config.ts <touched paths>`,
`pnpm i18n:check`, `pnpm openapi:check`. Repo-wide suites and `apps/web` `tsc`
go to CI. On the WSL box the openapi wrapper dies in the dependency build
(`tsc` `EBUSY`), so it runs in CI there; the export itself can be compared
locally with `pnpm --dir apps/api exec tsx scripts/export-openapi.ts <tmp>`.

Then produce the Phase 3 completion report and stop for approval.

## 3. Acceptance criteria

- Sidebar "Overview" opens `/dashboard/workspace/{id}/overview`; Home is
  unchanged.
- All eleven widgets render from real data, with `0` shown as `0`.
- Numbers match the SQL definitions in `data-model.md`; spot-check one
  workspace against the boards.
- Guest gets 403 and sees the error state, never zeros.
- Loading, empty and error states exist for every query.
- Light, dark and `modern` palettes are correct; 320 px has no horizontal
  scroll.
- `pnpm i18n:check` and `pnpm openapi:check` pass.
- No dependency, migration or unrelated file changed.

## 4. Risks in execution

| Risk | Mitigation |
| --- | --- |
| `count(...) filter (...)` shape differs across Drizzle versions | Same pattern already used in `get-project-statistics.ts`; copy its style. |
| Generated route tree not updated in tests | Run the dev server or build once; commit `routeTree.gen.ts`. |
| 30 s polling × 5 queries on a large workspace | One aggregate endpoint; other queries already poll on Home. |
| `timestamp` without time zone vs `now()` | Follow `get-tasks.ts` (`lte(dueDate, new Date(...))`); unit test with a fixed clock. |
| WSL memory on `tsc`/full suite | Focused tests locally, heavy gates in CI. |

## 5. Rollback

The change is additive: remove the route file, the nav entry, the dashboard
components/fetcher/hook, and the one API route. No data is written, so rollback
has no data impact.
