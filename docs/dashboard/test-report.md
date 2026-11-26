# Kaneo Dashboard — Phase 6 Test Report

> Phase: 6 – Quality Assurance and Optimization
> Date: 2026-11-27
> Branch: `feature/ui-development`
> Base commit: `aeb2cf88` (Gate 5 approval), plus the Phase 6 fixes below
> Scope: workspace Overview dashboard (`/dashboard/workspace/$workspaceId/overview`)

## 1. Environment

- Dev stack: `vp dev` (web `http://localhost:5173`, API `http://localhost:1337`),
  Postgres in `kaneo-verify-db`, workspace `xedWBWKmT0DamB8r4vHf1HMA5T877AGA`
  (Demo Workspace, project "Billing revamp", 12 tasks / 10 open, 2 intake
  requests).
- Browser: Orca embedded browser (the owner's browser), 1280, 1024, 768 and
  320 CSS px, light and dark.
- Automation: repository Playwright 1.64.1 in `tests/e2e` was installed for
  performance metrics only; visual verification stayed in Orca.
- Integration tests (`tests/api-integration/*`) were **not** run locally because
  they call `resetTestDatabase` and would wipe this development database. They
  run in Fork CI (run `45898349301`, head `727f6614`) and are green.

## 2. Functional testing

| Area | Check | Result |
| --- | --- | --- |
| Authentication | `GET /api/workspace/{id}/dashboard` without a session → 401 `UNAUTHORIZED` | PASS |
| Authentication | Sign-in with `demo@example.com`, same request → 200, 3.6 kB | PASS |
| Authorization | Dashboard for an unknown workspace id → 404 `NOT_FOUND` | PASS |
| Authorization | Guest / non-member → 403, archived projects excluded: `tests/api-integration/dashboard-summary.test.ts`, `dashboard-drilldown.test.ts` | PASS in CI |
| Workspace selection | URL with an unknown workspace id resolves to the active workspace and redirects to its home; sidebar switcher present | PASS |
| Navigation | Home, My tasks, Members, Inbox, Projects, project board all load; no console errors | PASS |
| Drilldown | "My overdue" tile opens dialog titled "My overdue" with 2 rows; focus lands on Close; Escape closes | PASS |
| Drilldown | Priority "Urgent" segment opens dialog with 2 rows, table headers Task/Project/Assignee/Priority/Due date | PASS |
| Drilldown | Row click closes the dialog, navigates to `/project/{id}/board?taskId={id}` and opens the task sheet with the correct title | PASS |
| Intake | "View all intake requests" opens `/dashboard/workspace/{id}/intake`, both requests listed, project links present | PASS |
| Data consistency | UI matches Postgres: projects 1, members 1, my open 6, my overdue 2, overdue+urgent 3, due in 3 days 1 (1 urgent), unassigned 4, open 10, priority 2/2/3/3/0 → 20/20/30/30/0 %, drilldown urgent total 2 | PASS |
| Invalid drilldown input | `?priority=bogus` → 400 | PASS |
| Loading state | `DashboardSkeleton` while the summary query is pending (component test) | PASS |
| Empty state | All-zero render (unknown workspace transient render) shows zeros, "No tasks match this filter right now." and "No intake requests in this group." | PASS |
| Error state | `WidgetError` message + Retry button (component test); not force-tested in the browser because the API process is shared with the owner | PASS (unit) |
| Theme | Toggle switches `html.dark` ↔ `html.light` and persists to local storage | PASS |
| Filters | Page-level date/project/workspace-wide filters are not part of dashboard v1 (`architecture.md` §11); project and priority filtering are exercised through chart drilldowns | N/A by design |

## 3. Visual testing

Screenshots: `/tmp/opencode/kaneo-e2e-20261127/gate6/` (local evidence).

| Viewport | Light | Dark | Horizontal overflow |
| --- | --- | --- | --- |
| 1280 | PASS | PASS | 1280 / 1280 |
| 1024 | PASS (after fix) | PASS | 1024 / 1024 |
| 768 | PASS | PASS | 768 / 768 |
| 320 | PASS | PASS | 320 / 320 |

- Layout follows `design-spec.md`: tiles 1 / 2 / 4 columns, charts stacked
  below 1024, one card shell, same spacing and typography in both themes.
- The only element wider than its box is the 24 px sidebar toggle, whose
  overflow comes from its `sr-only` label; it does not scroll the page.
- Horizontal scroll was measured as `documentElement.scrollWidth === innerWidth`
  at every viewport, and the page scroller reports no overflowing children
  except the two intentional `sr-only` cases above.
- Component consistency: tiles, cards, charts and the intake queue share
  `WidgetCard`; the drilldown is the only native `<dialog>`.

### Defects found and fixed

**D1 (Important, fixed): priority legend unreadable at 1024–1279 px.**
The chart row becomes three columns at `lg` (1024 px). At that width each card
has ~200 px of content, while the donut still used the viewport-based
`sm:flex-row`. The legend was squeezed to ~50 px: priority names truncated to
nothing and the colour swatches shrank to 0, leaving only counts and
percentages. Fixed by making the card a size container and stacking the donut
until the card itself is wide enough (`@container` on `WidgetCard`,
`@3xs:flex-row` in `priority-donut`). Verified: column at 1024 and 1200 (legend
labels 110 px / 171 px), row at 768 and 1280 (labels 201 px / 55 px, all five
labels visible), column at 320.

**D2 (Minor, fixed): hardcoded English "open" in the donut centre.**
Replaced with `dashboard:charts.openTotal`; `pnpm i18n:check:fix` propagated the
key to the other 20 locales as English fallback and `pnpm i18n:check` is clean.

### Deferred (not defects for Gate 6)

- Unknown workspace ids briefly render the empty dashboard before the router
  redirects to the active workspace home. Routing behaviour predates the
  dashboard; no user-facing data is leaked.
- The prototype `docs/dashboard/prototype/overview.html` still omits the
  percentage legend that the implementation prints. It is an approved design
  document; changing it needs its own annotation round.

## 4. Regression testing

- Dashboard, dashboard query and intake component tests:
  `apps/web` 13 files, 44 tests — PASS.
- Workspace API unit tests: `apps/api` 5 files, 48 tests — PASS.
- Route smoke test in Orca: Home, My tasks, Members, Inbox, Projects, project
  board — all load, 0 console errors.
- Existing API behavior: dashboard routes keep `workspaceAccess` +
  `requireWorkspacePermission(project:read, task:read)`; no API shape change in
  Phase 6.
- i18n: `pnpm i18n:check` — all locales in sync.
- Format/lint on changed files: `vp check` — clean.
- Typecheck, full build and API integration stay in Fork CI (WSL memory
  limits); see the CI run linked in `final-review.md`.

## 5. Commands run

```text
apps/web  pnpm exec vp test run --config vitest.config.ts \
          src/components/dashboard src/hooks/queries/dashboard src/components/intake
apps/api  pnpm exec vp test run --config vitest.config.ts src/workspace src/project-access
root      pnpm i18n:check
root      pnpm exec vp check apps/web/src/components/dashboard/priority-donut.tsx
          pnpm exec vp fmt <changed files>
```

## 6. Conclusion

No critical functional, authorization or responsive defect remains. One
important responsive defect (D1) and one i18n defect (D2) were found and fixed
in Phase 6; the fix is covered by the component tests and the 1024/1280/320
browser pass. Phase 6 acceptance criteria are met, with the performance caveats
recorded in `performance-report.md`.
