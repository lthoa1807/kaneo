# Intake Portal Phase 2 (API + realtime events) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intake Request API — create, list, detail, edit, transition, activity, and task attachment — with per-route ownership enforcement, the transition map, and `intake_request.*` events published for the WebSocket layer to hook later.

**Architecture:** One new feature folder `apps/api/src/intake/` (routes + zod schemas + controllers), mounted at `/api/intake`. Every request-scoped route resolves the actor once: manage-capable actors (`intakeRequest: ["manage"]`) get project-access-bounded access; everyone else is ownership-scoped (`createdById === userId`, miss → 404). Lifecycle transitions live in one service that owns the transition map, the note rules, the `WHERE status = expected` concurrency guard, activity rows, and event publishing.

**Tech Stack:** Hono `createRoute` + zod-openapi, Drizzle (postgres), `publishEvent`, `vite-plus/test` integration suite against real PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-11-24-intake-portal-design.md` (§4 ownership, §5 transitions, §6 schema, §7 API, §9 edge cases, §12 items 3, 7, 10). Phase 1 landed the tables, permissions vocabulary and `guest` role: `docs/superpowers/plans/2026-11-24-intake-portal-phase1.md`.

## Global Constraints

- Terminology: **Guest** everywhere; role name `guest`. Never "customer".
- Status values stored lowercase: `new | triaged | rejected | approved | in_progress | delivered | needs_revision | confirmed`.
- Guest ownership miss is **404, never 403** (do not confirm existence). Project-access miss stays 403 via `assertProjectAccess` (existing convention).
- Request status is **never** derived from task status; progress is display-only counts.
- No DELETE route; `CONFIRMED`/`REJECTED` are terminal.
- Realtime = publish `intake_request.created` / `intake_request.updated` via `publishEvent` only. No WebSocket change, no notification work this phase (Phase 3).
- Routes: thin handlers; behavior in controllers; zod request/response schemas; `ApiError` for coded errors, `HTTPException` for plain ones; middleware declared on `createRoute` reads the raw request, never `c.req.valid()`.
- After route changes: `pnpm openapi:check:fix` and commit `apps/docs/openapi.json`.
- Test command (WSL): start disposable PG
  `docker run -d --name kaneo-intake-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kaneo_test -p 127.0.0.1:5433:5432 postgres:18`,
  then `cd apps/api && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/kaneo_test pnpm exec vp test run --config vitest.integration.config.ts <filter>`. (`vp` is not on PATH; use `pnpm exec vp`. Remove the container when done.)
- Typecheck (WSL `execve EBUSY` workaround): `node node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/tsc.js -p apps/api/tsconfig.json --noEmit`.

## Review Focus

1. **Ownership scoping on every request-scoped route, not just list** — a guest who does not own the request gets 404 from detail, PATCH, transition, activity, and task attachment alike; a reasonable person expects no probe can distinguish "exists but not yours" from "not found". → Pinned in Task 4 Step 1 (`denies a non-owner guest on every request route with 404`).
2. **Illegal or wrong-actor transitions** — guest attempting approve/reject/deliver, manage attempting confirm/needs_revision, anything out of `CONFIRMED`/`REJECTED` returns `409 REQUEST_STATUS_TRANSITION` with the current status in the payload. → Pinned in Task 6 Steps 1–3.
3. **Note-required transitions** — reject and needs_revision without `note` return 400 before any state change. → Pinned in Task 6 Step 1.
4. **Task attach window** — attaching a task is rejected with `409 REQUEST_NOT_TASK_ATTACHABLE` in `new`, `triaged`, `delivered`, `confirmed`, `rejected`; allowed in `approved`, `in_progress`, `needs_revision`. → Pinned in Task 8 Step 1.
5. **`intakeEnabled` gates submission only** — creating into a disabled project returns 403, while transitions on already-existing requests in that project still succeed. → Pinned in Task 1 Step 1 and Task 6 Step 1.

---

### Task 1: Create request — service, number claim, create route

**Files:**
- Create: `apps/api/src/intake/controllers/claim-intake-request-numbers.ts`
- Create: `apps/api/src/intake/controllers/create-intake-request.ts`
- Create: `apps/api/src/intake/schema.ts`
- Create: `apps/api/src/intake/response.ts`
- Create: `apps/api/src/intake/index.ts`
- Modify: `apps/api/src/index.ts` (mount `api.route("/intake", intake)` next to the other routers, ~line 820-880)
- Test: `tests/api-integration/intake-create.test.ts`

**Interfaces:**
- Consumes: `intakeRequestTable`, `intakeActivityTable`, `projectTable` from `apps/api/src/database` barrel; `workspaceAccess.fromParam("workspaceId")`, `requireWorkspacePermission`, `requireEntitlement` (mirror the task create route's middleware order); `publishEvent` from `apps/api/src/events`; `claimTaskNumber` shape from `apps/api/src/task/controllers/claim-task-numbers.ts` (takes `dbOrTx`).
- Produces: `createIntakeRequest(input: { projectId: string; workspaceId: string; title: string; description: string | null }, currentUserId: string)` → returns the inserted row (drizzle `returning()` shape). `claimIntakeRequestNumbers(projectId: string, dbOrTx, count = 1)` → first claimed number. Mounted route `POST /api/intake/workspaces/{workspaceId}/intake-requests`. Later tasks import `createIntakeRequest` from `./controllers/create-intake-request`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api-integration/intake-create.test.ts
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createProjectFixture, createWorkspaceMember } from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function enableIntake(projectId: string) {
  await db.update(schema.projectTable)
    .set({ intakeEnabled: true })
    .where(eq(schema.projectTable.id, projectId));
}

describe("intake request creation", () => {
  it("creates a request with REQ numbering, activity row and event", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({ workspaceId: member.workspace.id });
    await enableIntake(project.id);
    mockAuthenticatedSession(member.user);

    const response = await createApp().app.request(
      `/api/intake/workspaces/${member.workspace.id}/intake-requests`,
      { method: "POST", body: JSON.stringify({ projectId: project.id, title: "Fix login", description: "It 404s" }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.number).toBe(1);
    expect(body.displayId).toBe("REQ-1");
    expect(body.status).toBe("new");
    expect(body.createdById).toBe(member.user.id);

    const [second] = await (await createApp().app.request(
      `/api/intake/workspaces/${member.workspace.id}/intake-requests`,
      { method: "POST", body: JSON.stringify({ projectId: project.id, title: "Second" }) },
    )).json();
    expect(second.number).toBe(2);

    const activities = await db.select().from(schema.intakeActivityTable);
    expect(activities).toHaveLength(2);
    expect(activities.every((a) => a.type === "created")).toBe(true);
  });

  it("rejects creation in a project without intake enabled (403)", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({ workspaceId: member.workspace.id });
    mockAuthenticatedSession(member.user);
    const response = await createApp().app.request(
      `/api/intake/workspaces/${member.workspace.id}/intake-requests`,
      { method: "POST", body: JSON.stringify({ projectId: project.id, title: "X" }) },
    );
    expect(response.status).toBe(403);
  });

  it("rejects creation in a project the actor cannot access (403)", async () => {
    const outsider = await createWorkspaceMember(); // separate workspace, or selected-access fixture without the project
    // arrange: project belongs to a workspace the actor holds no access to
    // expect 403 from assertProjectAccess
  });

  it("enforces the intakeRequest:create permission (403 guest-less viewer)", async () => {
    // member with role "viewer" → requireWorkspacePermission returns 403 MISSING_PERMISSION
  });
});
```

Fill the three sketch tests with the same arrange/act/assert shape as the first (fixtures: `createWorkspaceMember` inserts role `member`; for the access test create a second workspace's project and POST into it).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/kaneo_test pnpm exec vp test run --config vitest.integration.config.ts intake-create`
Expected: FAIL — route 404s (not mounted yet).

- [ ] **Step 3: Implement**

- `claim-intake-request-numbers.ts`: copy `claim-task-numbers.ts`, swapping the column to `projectTable.lastIntakeRequestNumber`. Keep the 404 on missing project.
- `create-intake-request.ts`: one transaction — claim number, insert `intakeRequestTable` row (`status` defaults `new`, `sourceType` defaults `guest_portal`), insert `intakeActivityTable` row `type: "created"`. After the transaction: `await publishEvent("intake_request.created", { ...row, currentUserId })`. Throw `HTTPException(403, { message: "Intake is not enabled for this project" })` when `project.intakeEnabled` is false (read the project inside the transaction `for update`-style via the claim's returning pattern — read the project row in the same tx first).
- `schema.ts`: `createIntakeRequestBody = z.object({ projectId: z.string(), title: z.string().min(1).max(200), description: z.string().max(10_000).optional() })`.
- `response.ts`: `intakeRequestSchema = z.object({ id, projectId, projectName: z.string(), number: z.number(), displayId: z.string(), title, description: z.string().nullable(), status: z.enum([...8 values]), createdById, requesterName/Email nullable optional, sourceType, confirmedAt nullable, createdAt, updatedAt })` — include `projectName` via a project join in controllers (guests hold no `project:*`, so the list/detail responses embed it display-only).
- `index.ts`: `createRoute` `POST /workspaces/{workspaceId}/intake-requests`, middleware `[workspaceAccess.fromParam("workspaceId"), requireWorkspacePermission({ intakeRequest: ["create"] }), requireEntitlement]`, responses 200/400/403/404 (use `errorResponse`/`jsonResponse` helpers).

- [ ] **Step 4: Run tests to verify they pass**

Same command as Step 2. Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/intake apps/api/src/index.ts tests/api-integration/intake-create.test.ts
git commit -m "feat: create intake requests with per-project numbering"
```

### Task 2: Guest project picker route

**Files:**
- Create: `apps/api/src/intake/controllers/list-intake-projects.ts`
- Modify: `apps/api/src/intake/index.ts`
- Test: `tests/api-integration/intake-create.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `findInaccessibleProjectIds(userId, ids)` from `apps/api/src/project-access/` (returns denied ids among the given ones); Task 1's router.
- Produces: `GET /api/intake/workspaces/{workspaceId}/intake-projects` → `[{ id: string, name: string }]`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("intake project picker", () => {
  it("lists only intake-enabled projects the actor can access", async () => {
    // guest member (role "guest") with selected access to Alpha (intake enabled) and Beta (disabled), plus Gamma (enabled, no access)
    // GET /api/intake/workspaces/{id}/intake-projects → exactly [Alpha.id]
  });
  it("requires intakeRequest:create (viewer gets 403)", async () => {});
});
```

- [ ] **Step 2: Run** — Expected: FAIL (route missing).
- [ ] **Step 3: Implement** — middleware `[workspaceAccess.fromParam("workspaceId"), requireWorkspacePermission({ intakeRequest: ["create"] })]`; controller: select `id, name` from projects in the workspace where `intakeEnabled` is true, filter out `findInaccessibleProjectIds` results, sort by name.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: list intake-enabled projects for the submission picker"`

### Task 3: List route — guest own-only, manage all, progress embed

**Files:**
- Create: `apps/api/src/intake/controllers/list-intake-requests.ts`
- Modify: `apps/api/src/intake/index.ts`, `apps/api/src/intake/schema.ts` (`listIntakeRequestsQuery`), `response.ts` (list item schema with `taskCount`, `completedTaskCount`)
- Test: `tests/api-integration/intake-list-and-detail.test.ts`

**Interfaces:**
- Consumes: Task 1 router; `workspacePermissionChecker(c)` from `apps/api/src/utils/require-workspace-permission.ts` (resolves roles once, `(permissions) => boolean`).
- Produces: `GET /api/intake/workspaces/{workspaceId}/intake-requests?projectId=&status=&page=&limit=` → `{ items: IntakeRequestListItem[], total, page, pageSize, totalPages }`. List item adds `taskCount: number, completedTaskCount: number` to the Task 1 schema. `completedTaskCount` counts linked tasks whose status is a completed one — use the same completed-status definition as existing task progress code (find it in `apps/api/src/task/controllers/` and reuse; do not invent a list).

- [ ] **Step 1: Write the failing tests**

```ts
describe("intake request list", () => {
  it("shows a guest only their own requests, with progress counts", async () => {
    // guest owns REQ-1 (2 linked tasks, 1 completed) in Alpha; staff owns REQ-2 in Alpha
    // GET as guest → items contain only REQ-1, taskCount 2, completedTaskCount 1, projectName "Alpha"
  });
  it("shows manage actors every request in projects they can access", async () => {
    // member (manage) sees REQ-1 and REQ-2
  });
  it("filters by projectId and status and paginates", async () => {
    // ?status=new returns only new ones; ?page=2&limit=1 returns the second item and total 2
  });
  it("never shows guests requests from projects they cannot access (403)", async () => {});
});
```

Progress embed: one grouped query over `taskTable` by `intakeRequestId` (`count(*)`, `count(*) filter (where completed)`), joined in the controller — not per-row.

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — pagination mirrors the simple assigned-tasks variant (`page`, `limit` via `pagingNumber`, default limit 20); middleware `requireWorkspacePermission({ intakeRequest: ["read"] })` (viewer may read). Guest scoping: if `!checker({ intakeRequest: ["manage"] })`, add `where createdById = userId`. Manage additionally filtered to accessible projects via `findInaccessibleProjectIds` over the candidate set.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: list intake requests with ownership scoping and task progress"`

### Task 4: Detail route + ownership helper

**Files:**
- Create: `apps/api/src/intake/shared/intake-actor.ts`
- Create: `apps/api/src/intake/controllers/get-intake-request.ts`
- Modify: `apps/api/src/utils/workspace-access-middleware.ts` (add `fromIntakeRequest` factory next to `fromTask()`, ~line 363-464)
- Modify: `apps/api/src/intake/index.ts`
- Test: `tests/api-integration/intake-list-and-detail.test.ts` (append)

**Interfaces:**
- Consumes: `workspacePermissionChecker`, `memberRoles` semantics; `intakeRequestTableRelations` (Phase 1) for the request→project→workspace join.
- Produces:
  - `workspaceAccess.fromIntakeRequest("requestId")` — resolves request → project → workspaceId, sets `workspaceId`, calls `assertProjectAccess` for that project (same flow as `fromTask`).
  - `resolveIntakeActor(c, requestId: string): Promise<{ row: IntakeRequestRow; isManager: boolean }>` — loads the row (404 if missing), computes `isManager = await workspacePermissionChecker(c)({ intakeRequest: ["manage"] })`. Controllers enforce: `if (!isManager && row.createdById !== c.get("userId")) throw new HTTPException(404, { message: "Intake request not found" })`.
  - `GET /api/intake/requests/{requestId}`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("intake request detail", () => {
  it("shows manage actors linked tasks and progress", async () => {
    // staff detail → body.linkedTasks = [{ id, number, title, status }...], taskCount, completedTaskCount, projectName
  });
  it("shows guests progress only, never task internals", async () => {
    // guest owner detail → body.linkedTasks undefined; taskCount/completedTaskCount present
  });
  it("denies a non-owner guest on every request route with 404", async () => {
    // guest B vs guest A's request: GET detail, PATCH, POST transition, GET activity, POST tasks → all 404
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — `fromIntakeRequest` mirrors `fromTask()` (select request → projectId → the same workspace resolution + `assertProjectAccess`). Detail controller: manage view joins linked tasks (`id, number, title, status`, ordered by number); guest view omits them. Reuse Task 3's progress query.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: intake request detail with per-actor views and ownership 404"`

### Task 5: PATCH — guest fixes typos while NEW

**Files:**
- Create: `apps/api/src/intake/controllers/update-intake-request.ts`
- Modify: `apps/api/src/intake/index.ts`
- Test: `tests/api-integration/intake-list-and-detail.test.ts` (append)

**Interfaces:**
- Produces: `PATCH /api/intake/requests/{requestId}`, body `{ title?, description? }` → updated row. Status is **not** patchable (strip it in the schema — only `title`/`description` exist).

- [ ] **Step 1: Write the failing tests**

```ts
describe("intake request patch", () => {
  it("lets the owner edit title/description while new", async () => {}); // 200, persisted
  it("rejects edits once triaged (409 REQUEST_NOT_EDITABLE)", async () => {}); // ApiError code in body
  it("rejects non-owners with 404 (even manage holders editing others)", async () => {});
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — middleware `requireWorkspacePermission({ intakeRequest: ["update"] })` + `requireEntitlement`; controller: ownership path **only** (spec §7 — no manage-side text edits in MVP), `row.status !== "new"` → `new ApiError(409, { code: "REQUEST_NOT_EDITABLE", message: "Only new requests can be edited" })`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: guest edits on own new intake requests"`

### Task 6: Transition service + route (the lifecycle core)

**Files:**
- Create: `apps/api/src/intake/controllers/transition-intake-request.ts`
- Modify: `apps/api/src/intake/index.ts`, `schema.ts` (`transitionIntakeRequestBody = z.object({ to: z.enum(["triaged","rejected","approved","in_progress","delivered","needs_revision","confirmed"]), note: z.string().max(10_000).optional() })`)
- Test: `tests/api-integration/intake-transition.test.ts`

**Interfaces:**
- Consumes: Task 4's `resolveIntakeActor`; `publishEvent`; `db.transaction`.
- Produces: `POST /api/intake/requests/{requestId}/transition` → updated row. Event `intake_request.updated` with `{ ...row, currentUserId, type: "status_changed", from, to }`.

- [ ] **Step 1: Write the failing tests — the transition map**

```ts
describe("intake request transitions", () => {
  const legal: Array<[from: string, to: string, actor: "manage" | "guest"]> = [
    ["new", "triaged", "manage"],
    ["new", "approved", "manage"],
    ["triaged", "rejected", "manage"],
    ["triaged", "approved", "manage"],
    ["approved", "in_progress", "manage"],
    ["in_progress", "delivered", "manage"],
    ["delivered", "needs_revision", "guest"],
    ["delivered", "confirmed", "guest"],
    ["needs_revision", "in_progress", "manage"],
  ];
  it.each(legal)("allows %s → %s by %s", async (from, to, actor) => {
    // seed a request in `from` (db.update status), act as the owner guest or a manage member, expect 200 + persisted status + activity row type "status_changed" with eventData { from, to }
  });

  const illegal: Array<[from: string, to: string, actor: "manage" | "guest"]> = [
    ["new", "delivered", "manage"],      // skips the flow
    ["delivered", "confirmed", "manage"], // confirm is the guest's decision
    ["delivered", "needs_revision", "manage"],
    ["new", "triaged", "guest"],          // guests never triage
    ["confirmed", "in_progress", "manage"], // terminal
    ["rejected", "approved", "manage"],   // terminal
  ];
  it.each(illegal)("rejects %s → %s by %s with 409 REQUEST_STATUS_TRANSITION", async (from, to, actor) => {
    // expect 409 and body.code === "REQUEST_STATUS_TRANSITION" and body.status === from (current status in payload)
  });

  it("requires a note to reject and to request revision (400)", async () => {
    // triaged → rejected without note → 400; delivered → needs_revision without note → 400; status unchanged
  });
  it("sets confirmedAt and confirmedVia on confirm, writes a confirmed activity row", async () => {
    // delivered → confirmed by owner: body.confirmedAt != null, body.confirmedVia === "guest_portal", activity type "confirmed"
  });
  it("blocks submission into disabled intake but not lifecycle of existing requests", async () => {
    // intakeEnabled=false on the project; existing request still transitions new → triaged (200)
  });
});
```

Activity `type` values: `status_changed` (with `eventData: { from, to }`), plus `note` in `content` when a note rides the transition; rejection note lands in the same `status_changed` row's `content` (spec §5: "stored in intake activity" — one row per transition).

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — route middleware `[workspaceAccess.fromIntakeRequest("requestId"), requireWorkspacePermission({ intakeRequest: ["update"] }), requireEntitlement]` (a read-only `viewer` 403s here naturally: it holds no `update`). One map in the controller:

```ts
const TRANSITIONS: Record<To, { from: string[]; actor: "manage" | "guest"; noteRequired?: boolean }> = {
  triaged: { from: ["new"], actor: "manage" },
  rejected: { from: ["new", "triaged"], actor: "manage", noteRequired: true },
  approved: { from: ["new", "triaged"], actor: "manage" },
  in_progress: { from: ["approved", "needs_revision"], actor: "manage" },
  delivered: { from: ["in_progress"], actor: "manage" },
  needs_revision: { from: ["delivered"], actor: "guest", noteRequired: true },
  confirmed: { from: ["delivered"], actor: "guest" },
};
```

Order of checks: 404 ownership (guest non-owner) → 409 if `!TRANSITIONS[to] || !TRANSITIONS[to].from.includes(row.status)` or actor class mismatch → 400 if note required and missing. Then in a transaction: `update ... set status = to, confirmedAt = (to === "confirmed" ? now : null-set nothing), confirmedVia` with `where(and(eq(id), eq(status, row.status)))` — zero rows updated → `new ApiError(409, { code: "REQUEST_STATUS_TRANSITION", message: ..., status: <fresh read> })` (re-read current status for the payload). Insert the activity row in the same transaction. Publish `intake_request.updated` after commit.
- [ ] **Step 4: Run** — Expected: PASS (9 legal + 6 illegal + 3 behavior tests).
- [ ] **Step 5: Commit** — `git commit -m "feat: intake request transition map with ownership and concurrency guard"`

### Task 7: Activity route

**Files:**
- Create: `apps/api/src/intake/controllers/list-intake-activity.ts`
- Modify: `apps/api/src/intake/index.ts`
- Test: `tests/api-integration/intake-transition.test.ts` (append)

**Interfaces:**
- Produces: `GET /api/intake/requests/{requestId}/activity` → `{ items: [{ id, type, userId, content, eventData, createdAt }] }` newest-first. Guest view filters to types `["created", "status_changed", "revision_requested", "confirmed", "note_added"]` (hides `task_linked` and future `ai.*`).

- [ ] **Step 1: Write the failing tests**

```ts
describe("intake request activity", () => {
  it("returns the full trail newest-first for manage actors", async () => {});
  it("hides task-linked and internal entries from the guest owner", async () => {});
  it("404s a non-owner guest", async () => {});
});
```

(To have a `task_linked` row to hide, Task 8 lands first or the test inserts the activity row directly via `db.insert` — prefer direct insert so tasks stay independent.)

- [ ] **Step 2: Run** — FAIL. **Step 3:** implement — middleware `[workspaceAccess.fromIntakeRequest("requestId"), requireWorkspacePermission({ intakeRequest: ["read"] })]`; one select, order by `createdAt desc`; guest filter `inArray(type, GUEST_VISIBLE_ACTIVITY_TYPES)` exported from the controller for reuse in Phase 3. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: intake activity trail with guest-visible filtering"`

### Task 8: Attach task to an approved request

**Files:**
- Create: `apps/api/src/intake/controllers/attach-intake-task.ts`
- Modify: `apps/api/src/intake/index.ts`
- Test: `tests/api-integration/intake-tasks.test.ts`

**Interfaces:**
- Consumes: the task-creation transaction internals from `apps/api/src/task/controllers/create-task.ts` (number claim, position, column resolution — extract or call them with a shared `tx`; do **not** duplicate the logic).
- Produces: `POST /api/intake/requests/{requestId}/tasks` → the created task (existing task response schema). Sets `task.intakeRequestId`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("intake task attachment", () => {
  it.each(["approved", "in_progress", "needs_revision"])("attaches while %s", async (status) => {
    // manage actor posts the existing task-create body → 200, task row has intakeRequestId set, activity row type "task_linked"
  });
  it.each(["new", "triaged", "delivered", "confirmed", "rejected"])("rejects attachment while %s (409 REQUEST_NOT_TASK_ATTACHABLE)", async (status) => {});
  it("rejects guests with 403 (they hold no manage/task permissions)", async () => {});
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — middleware `[workspaceAccess.fromIntakeRequest("requestId"), requireWorkspacePermission({ intakeRequest: ["manage"], task: ["create"] }), requireEntitlement]`. Controller: attach-window check against the loaded request (`ATTACHABLE_STATUSES = ["approved", "in_progress", "needs_revision"]`) → `new ApiError(409, { code: "REQUEST_NOT_TASK_ATTACHABLE", message: ... })`; then the existing task-create flow bound to the same transaction with `intakeRequestId` set (lift the transaction body of `create-task.ts` into a function both call, or parameterize it — smallest change that avoids a copy); insert `task_linked` activity row in the same tx; publish the existing `task.created` event plus `intake_request.updated`.
- [ ] **Step 4: Run** — Expected: PASS (10 tests).
- [ ] **Step 5: Commit** — `git commit -m "feat: attach tasks to intake requests inside the attach window"`

### Task 9: OpenAPI, docs, full-branch gates

**Files:**
- Modify: `apps/docs/openapi.json` (generated)
- Modify: `apps/docs` intake API page if one exists for tasks/workspaces (mirror how existing routes are documented; skip if the docs site generates from the spec)

**Interfaces:** Consumes everything above. Produces: green branch, PR 2/3 body.

- [ ] **Step 1: Regenerate OpenAPI and check docs**

Run: `pnpm openapi:check:fix` — inspect the `apps/docs/openapi.json` diff for the 8 new operations; commit it.

- [ ] **Step 2: Run every focused suite**

```
cd apps/api && DATABASE_URL=... pnpm exec vp test run --config vitest.integration.config.ts intake
cd tests/api && pnpm exec vp test run database
pnpm --filter @kaneo/permissions test
node node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/tsc.js -p apps/api/tsconfig.json --noEmit
pnpm exec vp check
```

Expected: all green, no type errors, no lint findings.

- [ ] **Step 3: Remove the disposable PG container**

`docker rm -f kaneo-intake-test-pg`

- [ ] **Step 4: Commit + push** — `git commit -m "docs: regenerate openapi for intake routes"` (if there is a diff), push `feature/intake-portal`, watch fork CI to green.
