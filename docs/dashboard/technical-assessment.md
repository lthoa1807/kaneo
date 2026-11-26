# Kaneo Dashboard — Technical Assessment (Phase 0)

> Phase: 0 – Technical Discovery
> Status: Complete — approved at Gate 0 (Phase 1 proceeded).
> Scope: read-only. No source, dependency, schema or database changes were made.
> Input spec: `docs/dashboard/project-spec.md`

## 1. Executive summary

Kaneo already has most of the raw material for a Dashboard: a typed REST API,
a workspace-scoped route shell with a sidebar, a workspace "Home" overview, a
project list that returns per-project rollup statistics, and database tables
for tasks, columns, activity and time entries. The main gaps are:

1. **No chart library and no chart component** are installed.
2. **No workspace-level aggregate statistics endpoint**. Task/status/priority
   totals exist only per project (board), so a workspace dashboard cannot be
   built from one cheap request today.
3. **No `completed_at` timestamp** on tasks, and no workspace/project-wide time
   entry query, so throughput and time-tracking analytics are not reliably
   computable from current data.
4. **"Dashboard" as a name is already taken** by the authenticated app shell
   (`/dashboard/...`), and the workspace index is already an overview page.
   The product placement decision must be made explicitly.

Recommendation: build the Dashboard as a **new sibling route and nav entry**
under the existing workspace layout, reuse the existing typed client, query
hooks and UI primitives, render charts with **small SVG/CSS components using
the existing `--chart-*` tokens**, and add **one read-only workspace dashboard
endpoint** in Phase 4 (approval required) instead of fanning out to every
project from the browser.

## 2. Repository and stack (verified)

- Monorepo: pnpm workspaces, `pnpm@12.18.0`, Node `^24.15.0 || >=26.0.0`
  (`package.json`). Task runner is Vite+ (`vp`).
- Apps: `apps/web` (React), `apps/api` (Hono), `apps/mobile`, `apps/docs`,
  `apps/site`.
- Packages: `packages/libs` (typed API client), `packages/permissions`,
  `packages/mcp`, `packages/editor`, `packages/importers`.
- Tests: `tests/api`, `tests/api-integration`, `tests/e2e`, `tests/storage-integration`.

### 2.1 Frontend (`apps/web`)

- React `^19.3.1`, TanStack Router `^1.170.46` (file-based routes, generated
  `src/routeTree.gen.ts`), TanStack Query `^5.105.0`.
- Tailwind CSS v4 (`^4.3.3`, CSS-first config), no `tailwind.config.js`.
- UI primitives: Base UI (`@base-ui/react`) + Radix, `class-variance-authority`,
  `tailwind-merge`, `clsx`; 60 components in `apps/web/src/components/ui/`.
- State: zustand (`src/store/`), i18next (`i18n/en-US.json` source locale,
  21 locales via `i18n/resources.ts`), `motion` for animation.
- Build: Vite+ with `@tanstack/router-plugin` (auto code splitting, ignores
  `*.test.tsx`).

### 2.2 Backend (`apps/api`)

- Hono `^4.13.14` + `@hono/zod-openapi` (`createRoute`, OpenAPI export).
- Drizzle ORM `^0.45.4` + PostgreSQL (`pg`); schema in
  `apps/api/src/database/schema.ts` (1,842 lines, single file).
- Auth: Better Auth `1.7.14`; API mounted at `/api`
  (`apps/api/src/index.ts:984`), routers mounted per domain
  (`apps/api/src/index.ts:819-882`).
- Redis is optional (`ioredis`) for cross-instance fan-out; WebSockets via
  `@hono/node-ws`.
- OpenAPI JSON is committed (`apps/docs/openapi.json`) and checked by
  `pnpm openapi:check`.

### 2.3 Shared client

- `packages/libs/src/hono.ts`: `hc<AppType>(apiUrl, { credentials: "include" })`,
  adds `X-Kaneo-Window-Id`; base URL from `VITE_API_URL` + `/api`
  (`packages/libs/src/api-url.ts`).
- Types are inferred from Hono routes (`InferResponseType<...>`), so adding a
  route automatically gives the web app a typed client.
- Authorization is cookie-based; there is no bearer token in the browser path.

## 3. Routing, layout and navigation (verified)

- Root → `_layout` → `_authenticated`
  (`apps/web/src/routes/_layout/_authenticated.tsx`) → `dashboard`.
- `dashboard.tsx` renders only `<Outlet />`.
- `dashboard/workspace/$workspaceId.tsx` mounts the app shell:
  `<Layout><Outlet /></Layout>`; `Layout`
  (`apps/web/src/components/common/layout.tsx`) is `SidebarProvider` +
  `AppSidebar` + `SidebarInset`.
- Workspace context in URLs is the **workspace UUID**, not a slug:
  `/dashboard/workspace/$workspaceId/...`.
- `dashboard/workspace/$workspaceId/index.tsx` is the current **Home** page:
  greeting, `WeekStrip`, `UpNext` (assigned tasks), `HomeProjects` (3 project
  cards with `completionPercentage`), `ActivityFeed` (8 items).
- Sidebar nav: `apps/web/src/components/nav-main.tsx` defines
  `NavItem { title, icon, url?, count? }` and renders
  `SidebarMenuButton` with `isActive={pathname === item.url}`.
  Existing staff items: Home, Inbox, My tasks, Members
  (i18n keys `navigation:sidebar.*`). Guests get My requests only.
- Route tree is generated; a new route file requires the dev server/build (or
  route tree regeneration) to appear in `routeTree.gen.ts`.

**Implication:** a Dashboard page is a new file under
`src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/` plus one
entry in `nav-main.tsx` and one i18n key. No routing architecture change.

## 4. Existing UI assets

- Primitives available: `card`, `button`, `tabs`, `select`, `combobox`,
  `table`, `badge`, `progress`, `meter`, `circular-progress`, `skeleton`,
  `spinner`, `empty`, `timeline`, `chart`-less.
- `apps/web/src/components/project-progress.tsx` already draws a tiny inline
  SVG donut (14×14) — proof that dependency-free SVG charts fit the codebase.
- Theme tokens in `apps/web/src/index.css` already include
  `--chart-1` … `--chart-5`, `--success`, `--warning`, `--info`, light/dark
  and a `[data-palette="modern"]` OKLCH palette.
- Dark mode: class-based (`@custom-variant dark`), `ThemeProvider`
  (`components/providers/theme-provider/index.tsx`) + zustand persisted
  preferences.
- Fonts: Geist Variable / Geist Mono Variable via `@fontsource-variable/*`.
- **No chart library** in `apps/web/package.json` or source. `d3-*` appears in
  `pnpm-lock.yaml` only transitively through `mermaid`; it is not a direct
  dependency and should not be used as one.

## 5. Data capabilities (verified against route files)

All paths below are relative to `/api`.

| Capability | Endpoint | Evidence | Notes |
|---|---|---|---|
| Workspaces of caller | `GET /workspace` | `apps/api/src/workspace/index.ts:38` | id, name, slug, logo, description, createdAt, role |
| Workspace detail | `GET /workspace/{workspaceId}` | same file:53 | archived → 403 code `WORKSPACE_ARCHIVED` |
| Members | `GET /workspace/{workspaceId}/members` | same file:74 | id, name, email, image, role; optional `projectId` filter |
| My capabilities | `GET /workspace/{workspaceId}/capabilities` | same file:135 | booleans per `workspaceCapabilities` |
| Project list + rollups | `GET /project?workspaceId=…` | `apps/api/src/project/index.ts:97` | each project carries `statistics { completionPercentage, totalTasks, dueDate }` |
| Task board | `GET /task/tasks/{projectId}` | `apps/api/src/task/index.ts:138` | filters `status`, `priority`, `assigneeId`, `dueBefore/After`, `page`, `limit ≤ 100`, `sortBy`; returns columns + tasks + archived/planned buckets |
| My assigned tasks | `GET /task/assigned?workspaceId=…` | same file:117 | open tasks only, max 100 rows, `total` counts all; `countOnly=true` returns total only |
| Workspace activity | `GET /activity/workspace/{workspaceId}` | `apps/api/src/activity/index.ts:35` | **20 most recent** events from the **last 30 days**; short excerpts |
| Task activity | `GET /activity/{taskId}` | same file:58 | per task |
| Time entries | `GET /time-entry/task/{taskId}` | `apps/api/src/time-entry/index.ts:21` | **per task only**; `duration` int, `endTime` nullable (running timer) |
| Task mutation events | WebSocket/`publishEvent` | `apps/api/src/events`, `apps/api/src/ws` | events such as `project.updated`; no dashboard-specific event needed for v1 |

### 5.1 Schema facts relevant to metrics

`apps/api/src/database/schema.ts`:

- `task` (line 690): `projectId`, `userId` (assignee), `title`, `status` (text,
  default `to-do`), `columnId`, `priority` (default `low`), `startDate`,
  `dueDate`, `createdAt`, `updatedAt`. **No `completedAt`.**
- `column` (line 605): per-project `name`, `slug`, `position`, `isFinal`.
  Default columns are To Do / In Progress / In Review / Done
  (`apps/api/src/project/controllers/insert-project.ts:29-32`).
- `project` (line 500): belongs to workspace, `archivedAt`, `position`.
- `workspace` (line 309), `workspace_member` (line 327) with `role`, `joinedAt`.
- `time_entry` (line 911): `taskId`, `userId`, `startTime`, `endTime`,
  `duration` (int), `description`.
- `activity` (line 945): `taskId`, `type`, `userId`, `content`, `eventData`,
  `createdAt`; indexes on task, user, createdAt.
- Task completion is counted in SQL as `status in ('done','archived')`
  (`apps/api/src/project/controllers/get-project-statistics.ts:33-36`), **not**
  via `column.isFinal`. For a renamed/custom final column this can disagree
  with the board's own "final" semantics.

### 5.2 Metric feasibility (from actual data only)

| Proposed metric | Status | Source / limitation |
|---|---|---|
| Workspace project count | Available | `GET /project` length |
| Workspace member count | Available | `GET /workspace/{id}/members` |
| Per-project total tasks | Available | `project.statistics.totalTasks` |
| Project completion % | Available | `project.statistics.completionPercentage` (rounded; `done`/`archived` definition) |
| Task counts by status / priority (workspace-wide) | **Not available in one call** | Only per-project board (`limit ≤ 100`, paginated) or new aggregate endpoint |
| My open assigned tasks | Available | `GET /task/assigned` (`total` + rows) |
| Overdue tasks | Partially | Derivable from assigned tasks and/or per-project board `dueDate`; not workspace-wide without fan-out |
| Recent activity | Available, capped | 20 items / 30 days only |
| Per-member task counts | **Not available** | Members endpoint has no task aggregation; assignee filter is per project |
| Time tracked per workspace/project/period | **Not available** | Time entries are per task; no range/aggregate endpoint |
| Tasks completed in a period (throughput) | **Not reliable** | No `completedAt`; activity is capped at 20/30 days |
| Cycle time / lead time | **Not available** | Missing completion timestamp and status-history table |

## 6. Auth and authorization

- Browser requests use the Better Auth session cookie
  (`credentials: "include"` in `packages/libs/src/hono.ts`).
- Route middleware pattern:
  `workspaceAccess.fromQuery()/fromProject()/fromParam()/fromTaskId()` then
  `requireWorkspacePermission({ project: ["read"], task: ["read"] })`
  (e.g. `apps/api/src/task/index.ts:126-129`,
  `apps/api/src/workspace/index.ts:78-85`).
- Project-level access is enforced in SQL by `projectAccessCondition(userId,
  projectId)` (`apps/api/src/project-access/`), used by
  `get-workspace-project-statistics.ts:78`.
- Guests hold no `task:read`/`project:read`; the web app disables queries via
  `useIntakeSurfaces()` / `useWorkspacePermission()` rather than only hiding UI
  (`.../workspace/$workspaceId/index.tsx:40-45`).
- **Requirement for the Dashboard:** every widget query must be disabled for
  guests and must rely on API enforcement; never compute or expose data the
  caller cannot read. Aggregates must apply the same project-access filter.

## 7. Testing and validation infrastructure

- Web: Vitest + jsdom (`apps/web/vitest.config.ts`), setup
  `src/test/setup.ts`, hundreds of co-located `*.test.ts(x)`; examples:
  `components/home/up-next.test.tsx`, `.../projects.test.tsx`.
- API unit: Vitest (`apps/api/vitest.config.ts`) including `tests/api/**`.
- API integration: `tests/api-integration` against real PostgreSQL.
- E2E: Playwright in `tests/e2e` (also BrowserStack).
- i18n gate: `pnpm i18n:check`; OpenAPI gate: `pnpm openapi:check`.
- Environment note (`docs/superpowers/notes/session-learnings.md`, repo
  `AGENTS.md`): WSL with ~9.7 GB RAM; full `apps/web` suites / package-wide
  `tsc` can exhaust memory. Use focused tests locally and CI for heavy gates.

## 8. Tool evaluation

### 8.1 Astryx (`meta/astryx`)

Verified from the repository README (fetched during this phase):

- React 19+ design system, 150+ components, StyleX-authored, themes via CSS
  custom properties, `className` overridable with Tailwind.
- Chart packages (`@astryxdesign/charts`, `@astryxdesign/vega`) exist **only
  under the `@canary` dist-tag**; no stable release.
- Currently in **Beta**; introduces a second component system and a StyleX
  peer dependency.

**Assessment:** do not adopt in this initiative. Kaneo already has 60 Base
UI/Radix primitives, a Tailwind v4 token system and dark mode. Adding Astryx
would duplicate the UI layer, add a styling runtime, and its charts are not
stable. Revisit only if a concrete component gap appears and Phase 2 design
proves it cannot be built with existing primitives.

### 8.2 Hallmark (`nutlope/hallmark`)

- A design/QA skill (not a runtime dependency) with a `sloplint` browser check
  and an audit mode; installs per agent, MIT.
- **Assessment:** use in Phase 2 (design review) and Phase 6 (visual QA) as an
  advisory audit only. It must not override decisions in an approved
  `design-spec.md`. No application dependency.

### 8.3 Modern Web Guidance

- Already available in this environment as the `modern-web-guidance` skill
  (`~/.agents/skills/modern-web-guidance`), backed by
  `npx modern-web-guidance`. No install into the repo.
- **Assessment:** use before writing layout/CSS/performance-sensitive UI; it
  is guidance, not a dependency.

## 9. Integration options for the Dashboard

| Option | How | Pros | Cons |
|---|---|---|---|
| A. New route + nav entry | `.../workspace/$workspaceId/overview` (or `dashboard`), add `NavItem` | Minimal change, Home stays intact, easy rollback | Two "overview" surfaces; naming must be clear |
| B. Replace Home | Rework `.../workspace/$workspaceId/index.tsx` | No duplicate surface | Larger blast radius, changes existing behavior, harder rollback |
| C. Workspace-level route | New route outside workspace layout | Independent | Loses sidebar/workspace context, duplicates shell, breaks permission conventions |

Recommendation: **A**, with a product-approved label ("Dashboard" or
"Overview") and a route segment that does not collide with the shell prefix,
e.g. `/dashboard/workspace/$workspaceId/overview`. Final naming is a Phase 1
decision.

## 10. Technical risks and limitations

1. **Aggregate data gap (high).** Workspace-wide status/priority counts would
   require one board request per project (each capped at 100 tasks/page), which
   is slow and incomplete. A read-only aggregate endpoint
   (`GET /workspace/{id}/dashboard` or similar) using the existing
   `requireWorkspacePermission` + `projectAccessCondition` is the correct
   fix, but it is an API/scope change requiring approval.
2. **Completion definition mismatch (high).** `project.statistics` counts
   `status in ('done','archived')`; the schema models `column.isFinal`.
   A custom final column or renamed status produces wrong percentages.
   Definition must be fixed before any completion metric ships.
3. **No `completedAt` (high).** Throughput, "completed this week", cycle time
   cannot be computed. Must be documented as unsupported or require a schema
   change (explicitly out of scope by default).
4. **Time tracking is per-task only (medium).** Workspace/project/period time
   analytics require either N per-task requests or a new endpoint.
5. **No chart library (medium).** Adding one is a dependency decision
   (approval). Building SVG/CSS charts keeps the bundle small and matches
   `project-progress.tsx`, but costs more UI work for axes/tooltips.
6. **Activity is capped (medium).** 20 events / 30 days means "recent
   activity" widgets must say so; it cannot feed trend charts.
7. **Naming collision (low/medium).** `/dashboard` already means the
   authenticated app shell; a page called "Dashboard" inside it needs clear
   copy and route naming.
8. **Generated route tree (low).** New route files require regeneration; CI
   and dev server handle it, but tests importing `routeTree.gen.ts` need the
   regenerated file.
9. **i18n/OpenAPI gates (low).** New user-facing copy must go through
   `i18n/en-US.json` + `pnpm i18n:check:fix`; new API routes require
   `pnpm openapi:check:fix` and committing `apps/docs/openapi.json`.
10. **Local resource limits (low).** Heavy suites must run scoped or in CI
    (WSL 9.7 GB).

## 11. Recommendations (for Phase 1)

1. Build on a new sibling workspace route; keep Home untouched (Option A).
2. Reuse `useGetProjects` (project rollups), `useGetAssignedTasks`,
   `useGetWorkspaceActivities`, `useGetWorkspaceUsers` and the typed
   `@kaneo/libs` client; no new data layer abstraction.
3. For v1 metrics, ship only what current endpoints support cheaply:
   project count, member count, per-project progress, assigned/open/overdue
   tasks for the caller, recent activity. Treat workspace-wide status/priority
   distribution and member/time analytics as Phase 4 items gated on an
   approved endpoint.
4. Charts: **SVG/CSS confirmed** — dependency-free components using
   `--chart-1..5` (see section 12.2).
5. Define "completed" as task status `done` (review decision, section 12) and
   explicitly document the divergence from `column.isFinal` in
   `project.statistics`.
6. Keep authorization identical to existing pages: disable queries for guests,
   and make the aggregate endpoint enforce project access in SQL.
7. Use polling consistent with existing hooks (30 s while visible) before
   considering WebSocket-driven dashboard updates.
8. Astryx: the owner wants to try Astryx inside the custom Dashboard.
   **Deferred past v1** with the other libraries (section 12.2); v1 installs
   nothing. Use Hallmark and Modern Web Guidance as review aids on the
   Dashboard only.

## 12. Decisions from review (2026-11-26)

Recorded from the Plannotator review of this document. None of these changes
the evidence in sections 2–10; they narrow the Phase 1 scope.

1. **Placement:** the Dashboard is a **new page**. The existing Home page
   stays untouched. Exact label and route segment are settled in Phase 1.
2. **Metric scope:** collect **project and task metrics**. Member statistics
   and time-tracking analytics are not confirmed for v1 and are treated as
   deferred until explicitly requested.
3. **Data approach:** implement the **easy path first** using the existing
   REST endpoints and client-side aggregation; improve later. No new
   aggregate endpoint in v1. The known limits (one board request per project,
   100-task pages, no completion timestamp) are accepted for v1 and must be
   stated in the UI where a widget is partial.
4. **Charts:** recommendation is **hand-built SVG/CSS** using the existing
   `--chart-1..5` tokens (no new dependency). See the comparison below.
5. **"Completed" definition:** task status **`done`**. `column.isFinal` is
   not used for Dashboard metrics. Documented limitation: a workspace with a
   custom final column whose slug is not `done` will report a different
   completion number than the board.
6. **Astryx:** try Astryx **only inside the custom Dashboard**, not across
   the app. This is a scoped exception to "Reuse First" and still needs
   confirmation of *which* component(s); see open item 6.
7. **Modern Web Guidance:** apply its guidance **to the custom Dashboard
   first** (layout, responsive, accessibility, performance). Baseline widely
   available, no polyfills unless a measured need appears.

### 12.1 Chart choice — comparison

| | Hand-built SVG/CSS | Chart library |
|---|---|---|
| Dependencies | none | 1 runtime package (~40–120 KB gzip depending on lib) |
| Bundle / LCP | smallest | measurable increase |
| Theme | native `--chart-*` tokens, light/dark/palette free | needs theme bridging to tokens |
| Fit | matches `project-progress.tsx` precedent | new API to learn |
| Effort for v1 (donut, bars, sparkline) | ~1 small component file | fast first chart, then config work |
| Interaction (tooltip, legend, a11y) | manual, but simple counts | built-in |
| Maintenance | local, no upgrade path | dependency upgrades |

For the v1 widget set (status donut, priority bars, project progress bars,
small activity/count sparkline) hand-built SVG/CSS is the better trade: no
dependency, correct theming, and the shapes are simple. A library only wins
if Phase 1 adds time-series charts with axes, zooming or many series.

## 12.2 Answers to the open items (2026-11-26)

1. **Chart choice:** hand-built **SVG/CSS**, confirmed. No chart dependency in
   v1. Libraries are added later, only if a chart need outgrows the hand-built
   set.
2. **Astryx scope:** the owner wants to try Astryx as the new interface, and
   **libraries ship later**. v1 therefore stays on SVG/CSS plus existing
   primitives and installs nothing. Astryx is revisited inside the Dashboard
   after v1, once a concrete component or chart gap is named. (Deferring it
   also avoids running Tailwind v4 and StyleX side by side in v1.)
3. **Route label:** **"Overview"**, at
   `/dashboard/workspace/$workspaceId/overview`, with a sidebar entry titled
   "Overview" (i18n key under `navigation:sidebar`). Home stays untouched.
4. **v1 widget list:** confirmed on 2026-11-26.
   - Project count, member count, per-project progress, my open tasks, my
     overdue tasks, recent activity (capped 20 events / 30 days).
   - **Sắp trễ hạn (gấp):** open tasks with `dueDate < now` and priority
     `urgent` or `high`.
   - **Gần đến hạn:** open tasks with `dueDate` in `[now, now + 3 days]`, any
     priority; the urgent/high share is shown inside the widget.
   - **Chưa phân công:** open tasks with `userId IS NULL`.
   - **Dự án sắp hoàn thành:** projects whose
     `statistics.completionPercentage >= 80` and `< 100`.
   - Workspace-wide status/priority distribution stays out of v1.
   - "Open task" means status **not** `done` and **not** `archived`, matching
     the terminal statuses Kaneo already treats as finished.

## 12.3 Scope change approved: workspace dashboard endpoint

The three new widgets cannot be counted honestly with the current API: the
board has no "unassigned" filter and no way to exclude completed tasks.
Decision (2026-11-26): add **one read-only endpoint**,
`GET /workspace/{workspaceId}/dashboard`, returning the workspace-wide
overdue-urgent, due-soon and unassigned counts. This reverses Phase 0
decision 3 ("no aggregate endpoint in v1") for these counts only.

Constraints for the endpoint:

- Reuse `requireWorkspacePermission({ project: ["read"], task: ["read"] })`.
- Apply `projectAccessCondition(userId, ...)` so guests and restricted members
  only count projects they can read.
- Exclude archived projects; exclude `done`/`archived` tasks.
- One SQL statement per count group, no per-project fan-out from the browser.
- Read-only; no schema change, no new table.

"Projects near completion" does **not** need the endpoint: `GET /project`
already returns `statistics.completionPercentage`, so the widget filters that
list in the client.

Later changes (owner review of the prototype, 2026-11-26) moved the widget list
on without changing this decision:

- "Projects near completion" and "Project progress" were removed as duplicates;
  project load is now a chart fed by the dashboard endpoint.
- "Intake queue" (waiting + in progress) was added and reuses
  `GET /workspaces/{id}/intake-requests`; it needs no new endpoint.
- The dashboard endpoint now also returns the task rows behind each count, not
  just the numbers, because every widget drills into a list.

## 13. Phase 0 compliance

- Read-only: yes. No source files, dependencies, migrations or database
  changes.
- Document created: `docs/dashboard/technical-assessment.md`.
- Document previously created by instruction: `docs/dashboard/project-spec.md`.
- Commands run were limited to file inspection (`ls`, `grep`, `sed`, `wc`),
  `git status`/`branch`, and two public GitHub README fetches for Astryx and
  Hallmark.

## 14. Approval status

WAITING FOR HUMAN APPROVAL

All four open items are answered (section 12.2), and the scope change those
answers require is recorded in section 12.3 (one read-only workspace dashboard
endpoint). Nothing else is outstanding.

No Phase 1 work starts, and no implementation plan is written, until this
assessment is approved.
