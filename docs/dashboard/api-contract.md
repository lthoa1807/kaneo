# Kaneo Dashboard — API Contract (Phase 1)

> Phase: 1 – Architecture and Functional Specification
> Status: Implemented (Phase 3–5, `feature/ui-development`); awaiting final review.
> Two read-only endpoints. Every other number the page shows already has a contract.

## 1. Endpoints

### 1.1 Dashboard aggregate

```
GET /api/workspace/{workspaceId}/dashboard
```

| Field | Value |
| --- | --- |
| `operationId` | `getWorkspaceDashboard` |
| Tags | `Workspaces` |
| Auth | session cookie (same as every browser call) |
| Middleware | `workspaceAccess.fromParam("workspaceId")`, then `requireWorkspacePermission({ project: ["read"], task: ["read"] })` |
| Caching | none; `Cache-Control: no-store` behaviour comes from the authenticated API |
| Pagination | none on the request. Each task bucket returns at most 50 rows plus an exact `total`; the drilldown is not paginated in v1 |

Location: route in `apps/api/src/workspace/index.ts`, request/response schema in
`apps/api/src/workspace/schema.ts`, query in
`apps/api/src/workspace/controllers/get-dashboard-summary.ts`.

### 1.2 Drilldown bucket

```
GET /api/workspace/{workspaceId}/dashboard/tasks?priority=high&projectId=…&day=YYYY-MM-DD
```

| Field | Value |
| --- | --- |
| `operationId` | `getWorkspaceDashboardTasks` |
| Tags | `Workspaces` |
| Auth | session cookie (same as every browser call) |
| Middleware | same as §1.1 |
| Query | `priority` (one of the five values), `projectId`, `day` (UTC `YYYY-MM-DD`). All optional; the provided filters are ANDed. |
| Response | `dashboardBucketSchema` (§2): exact `total`, first 50 rows, `truncated` |
| Ordering | due date ascending (nulls last), then priority descending, then task id |
| Caching | none |

The chart segments (`byPriority`, `dueByDay`, `byProject`) carry no rows in the
aggregate payload, so a click asks for that one bucket instead of re-filtering a
task list. `day` uses the same UTC day as `charts.dueByDay[].date`.

Location: `apps/api/src/workspace/controllers/get-dashboard-task-drilldown.ts`;
the row scope and ordering are shared with the aggregate in
`apps/api/src/workspace/controllers/dashboard-task-rows.ts`.

## 2. Response schema

```ts
const dashboardTaskSchema = z.object({
  id: z.string(),
  ticket: z.string(), // project key + number, e.g. BILL-12
  title: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  priority: z.enum(["no-priority", "low", "medium", "high", "urgent"]),
  dueDate: responseTimestamp.nullable(),
}).openapi("DashboardTask");

const dashboardBucketSchema = z.object({
  /** Exact count, independent of `items.length`. */
  total: z.number().int().nonnegative(),
  /** First 50 rows, ordered by dueDate nulls last, then priority desc, id asc. */
  items: z.array(dashboardTaskSchema).max(50),
  truncated: z.boolean(),
}).openapi("DashboardTaskBucket");

const dashboardTaskCountsSchema = z.object({
  /** Caller's own open tasks with dueDate < now. */
  mineOverdue: dashboardBucketSchema,
  /** Open tasks due before now with priority urgent or high. */
  overdueUrgent: dashboardBucketSchema,
  dueSoon: dashboardBucketSchema.extend({
    urgent: z.number().int().nonnegative(),  // urgent or high
    withinDays: z.literal(3),
  }),
  /** Open tasks with no assignee. */
  unassigned: dashboardBucketSchema,
}).openapi("DashboardTaskCounts");

const dashboardChartsSchema = z.object({
  /** Five rows, always all five priorities, zeroes included. */
  byPriority: z.array(z.object({
    priority: dashboardTaskSchema.shape.priority,
    count: z.number().int().nonnegative(),
  })).length(5),
  /** Seven rows: today .. today+6, zeroes included. */
  dueByDay: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // UTC day
    count: z.number().int().nonnegative(),
    urgent: z.number().int().nonnegative(),
  })).length(7),
  /** Every readable active project, sorted by count desc then name asc. */
  byProject: z.array(z.object({
    projectId: z.string(),
    name: z.string(),
    count: z.number().int().nonnegative(),
  })),
}).openapi("DashboardCharts");

export const workspaceDashboardSchema = z.object({
  generatedAt: responseTimestamp,
  tasks: dashboardTaskCountsSchema,
  charts: dashboardChartsSchema,
}).openapi("WorkspaceDashboard");
```

The drilldown endpoint returns `dashboardBucketSchema` as its whole response.
Its query schema:

```ts
const dashboardDrilldownQuery = z.object({
  priority: dashboardTaskSchema.shape.priority.optional(),
  projectId: z.string().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // UTC day
});
```

Example (one bucket shown in full):

```json
{
  "generatedAt": "2026-11-26T13:45:02.117Z",
  "tasks": {
    "mineOverdue": {
      "total": 2,
      "truncated": false,
      "items": [
        {
          "id": "tsk_01J8Z4K3M9",
          "ticket": "BILL-12",
          "title": "Dialog focus ring",
          "projectId": "prj_design",
          "projectName": "Design system",
          "assigneeId": "usr_hoa",
          "assigneeName": "Hoa",
          "priority": "high",
          "dueDate": "2026-11-23T00:00:00.000Z"
        }
      ]
    },
    "overdueUrgent": { "total": 7, "truncated": false, "items": [] },
    "dueSoon": { "total": 10, "urgent": 5, "withinDays": 3, "truncated": false, "items": [] },
    "unassigned": { "total": 9, "truncated": false, "items": [] }
  },
  "charts": {
    "byPriority": [
      { "priority": "urgent", "count": 4 },
      { "priority": "high", "count": 9 },
      { "priority": "medium", "count": 12 },
      { "priority": "low", "count": 7 },
      { "priority": "no-priority", "count": 8 }
    ],
    "dueByDay": [
      { "date": "2026-11-26", "count": 2, "urgent": 2 }
    ],
    "byProject": [
      { "projectId": "prj_billing", "name": "Billing revamp", "count": 10 }
    ]
  }
}
```

`withinDays` is part of the payload so the widget hint cannot drift from the
server's window when the constant changes later. Empty `items` in the example
are elided for length; the real response always fills them up to 50.

## 3. Status codes

| Code | When | Body |
| --- | --- | --- |
| 200 | caller can read the workspace and its projects/tasks | `workspaceDashboardSchema` (§1.1) or `dashboardBucketSchema` (§1.2) |
| 400 | workspace ID, priority or day fails validation | `apiErrorSchema` |
| 403 | missing `project:read` or `task:read`, archived workspace, or no workspace access | `apiErrorSchema` |
| 404 | workspace not found | `apiErrorSchema` |

No 500 is declared; unexpected failures go through the existing Hono error
handler.

## 4. Authorization rules

- The SQL applies `projectAccessCondition(userId, task.projectId)`, so a member
  limited to selected projects counts only those.
- Archived projects are excluded.
- `done` and `archived` tasks are excluded from every count and every row.
- Task rows are scoped by the same condition as the counts; the payload can
  only contain tasks the caller could already open in that project. The cap
  (50 per bucket) limits how much assignee and title data one request returns.
- Both endpoints share `dashboardTaskWhere()`, so a drilldown bucket cannot
  return a task that its matching count excluded.
- Guests (no `task:read`) receive 403 and the UI shows its error state.

## 5. Typed client

`packages/libs/src/hono.ts` infers response types from the Hono app type, so
adding the route gives the web app a typed client with no manual type file.
The fetchers are:

```ts
// apps/web/src/fetchers/dashboard/get-dashboard-summary.ts
client.workspace[":workspaceId"].dashboard.$get({ param: { workspaceId } });

// apps/web/src/fetchers/dashboard/get-dashboard-task-drilldown.ts
client.workspace[":workspaceId"].dashboard.tasks.$get({
  param: { workspaceId },
  query: { priority, projectId, day }, // only the set filters
});
```

## 6. Contract gates

1. `pnpm openapi:check:fix` regenerates `apps/docs/openapi.json`; commit the
   diff with the route change.
2. Add the endpoint to `apps/docs` API reference only if that page lists
   workspace routes generically; no hand-written doc.
3. No change to `packages/mcp`; the dashboard endpoint is UI-facing and
   read-only, and MCP tools are out of v1 scope.

## 7. Why not reuse the board endpoint

`GET /task/tasks/{projectId}` cannot express two of the counts:

- no "unassigned" filter (`assigneeId` is a plain string, empty means omit),
- no "exclude done/archived" filter.

It would also need one request per project per widget per 30 s refresh. The
single aggregate endpoint is smaller than N fan-out calls and is the only way
to return an exact unassigned count.
