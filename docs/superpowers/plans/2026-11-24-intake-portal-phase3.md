# Intake Portal Phase 3 (Guest portal UI + staff intake tab) Implementation Plan

> **Status:** shipped in PR #5. Every step below was executed; the boxes were left
> unticked rather than retro-edited, so treat `main` as the source of truth. Phase 3.1,
> 3.2 and 4 plans carry their own ticks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three intake surfaces in `apps/web` on top of the Phase 2 API — guest workspace-level "My requests", guest project-level portal, and the staff project intake tab — plus the membership identity that separates guests from staff, guest invitations bounded to selected projects, a guest badge in the members table, and server-side assignee filtering.

**Architecture:** One shared intake UI folder `apps/web/src/components/intake/` (status maps, list, detail panels, modals, activity). Data comes from thin fetchers in `apps/web/src/fetchers/intake/` wrapped by TanStack Query hooks in `apps/web/src/hooks/{queries,mutations}/intake/` with 30s polling and post-mutation invalidation. **Identity and authorization are separate:** the caller's guest/staff identity comes from a new server answer (`GET /workspace/{id}/membership` → `kind`), resolved from workspace membership; what the UI may *do* comes from the existing capability map (`GET /workspace/{id}/capabilities`). Guest surfaces render a standalone guest shell (never `ProjectLayout`, which fetches `project:read` data guests do not have); the staff surface is a third project tab next to Tasks/Backlog.

**Tech Stack:** React 19 + TanStack Router (file routes) + TanStack Query + coss/base-ui primitives + i18next (`i18n/en-US.json` is the source), Hono `createRoute` + Drizzle for the two small API additions, `vite-plus/test`.

**Spec:** `docs/superpowers/specs/2026-11-24-intake-portal-design.md` (§4 permissions, §5 transitions, §7 API, §8 UI/UX, §9 edge cases, §10 impact, §12 items 4–6, 9, 10). Phase 1 (schema + permissions + `guest` role) and Phase 2 (API + events) are landed on `feature/intake-portal`.

## Route map

All routes live under the existing `_layout/_authenticated/dashboard/workspace/$workspaceId` layout (which supplies `Layout` + `<Outlet>`).

| # | Surface | Route | File |
|---|---|---|---|
| 1 | Guest, workspace level | `/dashboard/workspace/$workspaceId/my-requests` | `my-requests.tsx` |
| 2 | Guest, project level (list + create) | `/dashboard/workspace/$workspaceId/project/$projectId/requests` | `project/$projectId/requests.tsx` |
| 3 | Guest, project level (detail) | `…/project/$projectId/requests/$requestId` | `project/$projectId/requests.$requestId_.tsx` |
| 4 | Staff (list, triage) | `…/project/$projectId/intake` | `project/$projectId/intake.tsx` |
| 5 | Staff (detail, transitions, tasks) | `…/project/$projectId/intake/$requestId` | `project/$projectId/intake.$requestId_.tsx` |

Surface gates — **identity is not a capability**:

```ts
// from GET /workspace/{id}/membership  →  { kind: "guest" | "staff", role }
const identity = useGetWorkspaceMembership(workspaceId); // server decides
const can = useWorkspacePermission();                     // capabilities

guestPortal = identity.kind === "guest" && can.readIntake() && can.createIntakeRequests();
staffIntake = identity.kind === "staff" && can.readIntake();
// staff actions
canManageIntake()  (+ canCreateTasks() for attach-task)
```

Why not `task:read`: a custom staff role can hold intake permissions without task permissions, and would be misclassified as a guest. Why not a role-name check in the browser: role names are editable data, and the same rule would be re-derived in five places. `kind` is answered once, by the server, from the membership row.

- Route 1 does not get its own detail route. A row links to route 3 for that project — one detail implementation, and it lands the guest in the project portal area they will use again.
- Guest routes 1–3 must never render `ProjectLayout` or call `client.project.*`, `useGetProject`, `useGetTasks`, `useGetColumns`.

## Route collision check (verified against the current tree)

- Under `dashboard/workspace/$workspaceId/`: `inbox`, `members`, `my-tasks`, `search`, `index`, `projects`, `project/$projectId/{index,board,backlog,calendar,gantt,task/$taskId_}`. No `my-requests`, `requests`, or `intake` segment exists today.
- `project/$projectId/requests.tsx` + `requests.$requestId_.tsx` and `intake.tsx` + `intake.$requestId_.tsx` are flat-dotted siblings. **The trailing `_` is load-bearing:** without it TanStack makes the detail a child layout of the list, and the list component would have to render `<Outlet />` or the detail would never appear. `_` keeps the same URLs (`/requests/$requestId`) with no parent/child nesting — exactly what `project/$projectId/task/$taskId_.tsx` already does in this repo. No directory named `route.tsx` is used anywhere in this repo, so do not introduce one.
- The separate slug tree `/$workspaceSlug/task/$ticketId/{-$title}` cannot capture `/dashboard/...`: the static `dashboard` segment outranks a `$workspaceSlug` param. Leave it untouched.
- `requests` and `intake` are siblings of `board/backlog/calendar/gantt`, so `/project/$projectId/index` keeps redirecting to `board` unchanged.
- Keep `intake` **out of** `ProjectView` (it drives the switcher, keyboard shortcuts and the persisted `taskLayout` preference). Add it only to `ProjectRoute` + `PROJECT_ROUTE_PATHS`.
- New route files require `apps/web/src/routeTree.gen.ts` regeneration (TanStack vite plugin in `apps/web/vite.config.ts`; `vitest.config.ts` does **not** load it, so running web tests does not regenerate it). Regenerate by starting `pnpm --filter @kaneo/web dev` briefly and stopping it; commit the diff in Task 9 and confirm exactly the 5 new route ids appear.

## Global Constraints

- **Identity ≠ authorization.** Guest/staff comes from `GET /workspace/{id}/membership` (`kind`), never from `task:read`, never from a role-name guess in the browser. Permissions come from `GET /workspace/{id}/capabilities`.
- **No new intake endpoints.** Phase 2 covers every read/write: `GET /intake/workspaces/{ws}/intake-projects`, `GET|POST …/intake-requests`, `GET|PATCH /intake/requests/{id}`, `POST …/transition`, `GET …/activity`, `POST …/tasks`. The only new API surface is the membership-kind read (Task 1), the guest-invitation guard (Task 2) and assignability filtering (Task 3).
- **No database migration in this phase.** Guest identity rides on the existing reserved `guest` role on the membership row. `shortcut:` identity is derived from role tokens, not a `workspace_member.kind` column — add that column when guests stop being a role (e.g. when a guest can also hold a staff role).
- **Guests never render `ProjectLayout`** or call `client.project.*` — they hold no `project:*` permission. The project-level portal resolves its project name from `GET …/intake-projects` (gated on `intakeRequest:create`).
- Terminology: **Guest** / **Request**; role name `guest`. Never "customer". Status values stay lowercase (`new`, `triaged`, `rejected`, `approved`, `in_progress`, `delivered`, `needs_revision`, `confirmed`).
- UI hiding is never authorization. The API is the boundary; these gates only shape the UI.
- Request and Task stay separate entities: one request links many tasks, task status never drives request status, guests never see `linkedTasks`.
- Realtime = TanStack Query `refetchInterval: 30_000` on list/detail queries + explicit invalidation after each mutation. No WebSocket work (Phase 2 published events; consumers come later). No optimistic status transitions — the API can answer `409` with the live status.
- Staff list must not silently drop requests: see the paging rule in Task 8.
- All copy through i18n keys; `i18n/en-US.json` is the source. After adding keys run `pnpm i18n:check:fix` and `pnpm i18n:schema`.
- Test commands (WSL):
  - web: `pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts <filter>`
  - api integration (Tasks 1–3): start disposable PG
    `docker run -d --name kaneo-intake-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=kaneo_test -p 127.0.0.1:5433:5432 postgres:18`,
    then `cd apps/api && DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/kaneo_test pnpm exec vp test run --config vitest.integration.config.ts <filter>`, then `docker rm -f kaneo-intake-test-pg`.
  - typecheck (WSL `execve EBUSY` workaround, one project at a time):
    `node node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/tsc.js -p apps/web/tsconfig.json --noEmit`
    (`apps/api/tsconfig.json` for API tasks).
- After route or schema changes: `pnpm openapi:check:fix` and commit `apps/docs/openapi.json`.

## Review Focus

1. **Identity never comes from a capability or a browser-side role guess** — a custom staff role with intake permissions and no `task:read` must land on the staff surface, and a guest must never be classified as staff. → Pinned in Task 1 Step 1.
2. **A guest can never be invited with `all` project access**, and accepting a guest invitation never upgrades them to a staff role. → Pinned in Task 2.
3. **Guests are not assignable, server-side** — not merely hidden from the picker. → Pinned in Task 3.
4. **Guest surfaces never touch `project:*`** — no `ProjectLayout`, no `useGetProject`, no `useGetTasks`, no project columns fetch on routes 1–3. → Pinned in Task 7 and Task 9's grep step.
5. **`ProjectView` stays untouched** — adding `intake` to it would leak into `taskLayout` persistence and the `goToTasks`/`toggleLayout` shortcuts. → Pinned in Task 8 Step 1.
6. **`routeTree.gen.ts` diff is exactly the five new routes** and `/project/$projectId/index` still redirects to `board`. → Pinned in Task 9 Step 1.
7. **Staff triage never hides a request behind client-side grouping** — see Task 8's paging rule. → Pinned in Task 8 Step 3.
8. **A guest's capabilities actually resolve** — `useWorkspacePermission` takes the role from the membership endpoint, because guests are 403'd from `listMembers`. If this is skipped, every intake gate is `false` for guests and the portal never renders. → Pinned in Task 1 Step 6.1 and the `guest capabilities` API test.
9. **A guest page load makes no permission-gated staff call** — no `/task/assigned`, no `/project`, no `/organization/list-members` (the single `get-full-organization` probe from `useActiveOrganization` is pre-existing and expected). Hooks are disabled, not just unrendered. → Pinned in Task 6 Step 3 and its network-log check.
10. **A viewer is never offered a transition it would 403 on** — triage buttons need `canUpdateIntake()`, attaching a task needs `canManageIntake() && canCreateTasks()`. → Pinned in Task 1 bundles and Task 8 Step 3.

---

### Task 1: Membership identity + capability bundles + surface resolver

**Files:**
- Create: `apps/api/src/workspace-members/is-guest-role.ts`
- Create: `apps/api/src/workspace/controllers/get-my-membership.ts`
- Modify: `apps/api/src/workspace/index.ts` (new `GET /{workspaceId}/membership` route), `apps/api/src/workspace/response.ts` (`workspaceMembershipSchema`)
- Test: `tests/api-integration/workspace-membership-kind.test.ts`
- Modify: `packages/permissions/src/capabilities.ts`, `packages/permissions/src/capabilities.test.ts`
- Modify: `apps/web/src/hooks/use-workspace-permission.ts`
- Create: `apps/web/src/fetchers/workspace/get-workspace-membership.ts`, `apps/web/src/hooks/queries/workspace/use-get-workspace-membership.ts`
- Create: `apps/web/src/components/intake/intake-surfaces.ts`
- Test: `apps/web/src/components/intake/intake-surfaces.test.ts`

**Interfaces:**
- Produces (API): `GET /api/workspace/{workspaceId}/membership` → `{ kind: "guest" | "staff", role: string | null }`. Middleware `[workspaceAccess.fromParam("workspaceId")]` only — every member must be able to read their own kind, including guests (they hold no `workspace:read`). Instance admins who are not members get `kind: "staff"`, `role: null`.
- Produces (web): `useGetWorkspaceMembership(workspaceId)`; `resolveIntakeSurfaces({ kind, readIntake, createIntakeRequests, manageIntake })` → `{ guestPortal, staffIntake, canCreate, canManage }`; helpers `canReadIntake`, `canCreateIntakeRequests`, `canManageIntake` on `useWorkspacePermission()`.
- Changes existing web behavior: `useWorkspacePermission()` must take the caller's role and its "should I fetch capabilities" signal from this endpoint, not from `useGetActiveWorkspaceUser()`. **See Step 6.1 — without it a guest gets an all-false capability map and the portal never renders.**

- [ ] **Step 1: Write the failing API test**

```ts
// tests/api-integration/workspace-membership-kind.test.ts
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

beforeEach(resetTestDatabase);

it("answers guest for a guest member with no task permissions", async () => {
  const guest = await createWorkspaceMember({ role: "guest" });
  mockAuthenticatedSession(guest.user);
  const body = await (await createApp().app.request(
    `/api/workspace/${guest.workspace.id}/membership`,
  )).json();
  expect(body).toEqual({ kind: "guest", role: "guest" });
});

it("answers staff for a custom role that has intake but no task permissions", async () => {
  // seed a workspace_role row with only { intakeRequest: ["read","create","update","manage"] },
  // assign it to a member; expect kind "staff" (identity is membership, not task:read)
});

it("answers staff for the owner and for an instance admin without a membership", async () => {});

it("never answers guests with a 403 (they hold no workspace:read)", async () => {
  // guest member → 200, not 403
});

describe("guest capabilities", () => {
  it("lets a guest read and create intake without any task or project permission", async () => {
    const guest = await createWorkspaceMember({ role: "guest" });
    mockAuthenticatedSession(guest.user);
    const body = await (await createApp().app.request(
      `/api/workspace/${guest.workspace.id}/capabilities`,
    )).json();
    expect(body.readIntake).toBe(true);
    expect(body.createIntakeRequests).toBe(true);
    expect(body.manageIntake).toBe(false);
    // The portal gate depends on these two staying true in the seeded guest role.
  });
});
```

- [ ] **Step 2: Run — expect failure**

`cd apps/api && DATABASE_URL=… pnpm exec vp test run --config vitest.integration.config.ts workspace-membership-kind`
Expected: FAIL (404, route missing).

- [ ] **Step 3: Implement the API side**

```ts
// apps/api/src/workspace-members/is-guest-role.ts
// Role payloads carry roles as one comma-separated string.
export function isGuestRole(role: string | null | undefined): boolean {
  if (typeof role !== "string") return false;
  return role
    .split(",")
    .map((token) => token.trim())
    .includes("guest");
}
```

```ts
// apps/api/src/workspace/controllers/get-my-membership.ts
// Guests hold no workspace:read, so this must not be permission-gated — it
// answers about the caller's own membership only.
async function getMyMembership(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: workspaceUserTable.role })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);
  const role = member?.role ?? null;
  return { kind: isGuestRole(role) ? ("guest" as const) : ("staff" as const), role };
}
export default getMyMembership;
```

Route in `apps/api/src/workspace/index.ts`, next to the capabilities route: `operationId: "getMyWorkspaceMembership"`, `path: "/{workspaceId}/membership"`, `tags: ["Workspaces"]`, middleware `[workspaceAccess.fromParam("workspaceId")]`, responses 200 (`workspaceMembershipSchema`) / 404. Add `workspaceMembershipSchema = z.object({ kind: z.enum(["guest","staff"]), role: z.string().nullable() })` to `response.ts`.

- [ ] **Step 4: Run — expect pass**, then regenerate the OpenAPI snapshot (`pnpm openapi:check:fix`) and commit it with the rest.

- [ ] **Step 5: Write the failing web test**

```ts
// apps/web/src/components/intake/intake-surfaces.test.ts
const cap = (over: Partial<IntakeCapabilities>) => ({
  readIntake: false, createIntakeRequests: false, manageIntake: false, ...over,
});

it("gives a guest the portal and no staff surface", () => {
  expect(resolveIntakeSurfaces({
    kind: "guest", ...cap({ readIntake: true, createIntakeRequests: true }),
  })).toEqual({ guestPortal: true, staffIntake: false, canCreate: true, canManage: false });
});

it("keeps a custom staff role without task permissions on the staff surface", () => {
  expect(resolveIntakeSurfaces({
    kind: "staff", ...cap({ readIntake: true, createIntakeRequests: true }),
  })).toEqual({ guestPortal: false, staffIntake: true, canCreate: true, canManage: false });
});

it("gives a viewer the staff surface, read-only", () => {
  expect(resolveIntakeSurfaces({ kind: "staff", ...cap({ readIntake: true }) }))
    .toEqual({ guestPortal: false, staffIntake: true, canCreate: false, canManage: false });
});

it("shows nothing when the workspace has no intake permissions", () => {
  expect(resolveIntakeSurfaces({ kind: "staff", ...cap({}) }))
    .toEqual({ guestPortal: false, staffIntake: false, canCreate: false, canManage: false });
});

it("never shows a guest the staff surface, whatever the permissions say", () => {
  expect(resolveIntakeSurfaces({
    kind: "guest",
    ...cap({ readIntake: true, createIntakeRequests: true, manageIntake: true }),
  }).staffIntake).toBe(false);
});
```

- [ ] **Step 6: Implement the web side**

`packages/permissions/src/capabilities.ts` — add four bundles (authorization only, never identity):

```ts
readIntake: { intakeRequest: ["read"] },
createIntakeRequests: { intakeRequest: ["create"] },
updateIntake: { intakeRequest: ["update"] },
manageIntake: { intakeRequest: ["manage"] },
```

Extend `capabilities.test.ts`'s expected-name list. (No `readTasks` bundle: nothing in this plan gates on task read any more.)

`updateIntake` is what the API requires for a transition (`POST …/transition`), so it gates the triage buttons; `manageIntake` is only for attaching a task. A viewer holds `intakeRequest: ["read"]` and must not be offered a transition it would 403 on.

`use-workspace-permission.ts`: add `canReadIntake`, `canCreateIntakeRequests`, `canUpdateIntake`, `canManageIntake`.

- [ ] **Step 6.1: Move the role source in `useWorkspacePermission` (guest blocker)**

The hook currently reads `role = activeMember?.role` from `useGetActiveWorkspaceUser()` (which calls `authClient.organization.listMembers`) and only enables the capabilities query when that role exists. Guests cannot call that native endpoint: `apps/api/src/utils/native-organization-read-access.ts` requires `workspace: ["read"]` for `/organization/list-members` and `/organization/get-full-organization`, and the guest payload has no `workspace` statement. So for a guest the role is `undefined`, the capabilities query stays disabled, and `can` is all-false — the portal gate can never be true.

Change the hook so it no longer calls `useGetActiveWorkspaceUser()` at all — not just for `role`, because that hook is what fires `/organization/list-members` for a guest on every page:

```ts
const { data: membership, isLoading: isMembershipLoading } =
  useGetWorkspaceMembership(workspaceId);
const role = membership?.role ?? undefined; // keeps the cache-key shape
```

Also delete the `member: activeMember` field it returned — nothing reads it (`grep -rn "permission.member\|}= useWorkspacePermission" apps/web/src`), and keeping it would keep the guest 403 alive. `isCheckingPermissions` stays `Boolean(workspaceId && role) && (isLoading || (!capabilities && !isError))`; `isOwner`/`isAdmin` read the membership role unchanged. Do not fall back to `activeMember?.role` when membership is missing: a missing answer must mean "no capabilities", not "assume staff".

`useGetActiveWorkspaceUser` stays for the staff-only member views (members table, assignee pickers); it is no longer a gate source.

```ts
// apps/web/src/components/intake/intake-surfaces.ts
export type MembershipKind = "guest" | "staff";

export type IntakeIdentity = {
  kind: MembershipKind;
  readIntake: boolean;
  createIntakeRequests: boolean;
  manageIntake: boolean;
};

export type IntakeSurfaces = {
  guestPortal: boolean;
  staffIntake: boolean;
  canCreate: boolean;
  canManage: boolean;
};

// Identity comes from the server (membership); capabilities only decide what
// the surface may offer. Neither is inferred from the other.
export function resolveIntakeSurfaces(can: IntakeIdentity): IntakeSurfaces {
  const isGuest = can.kind === "guest";
  return {
    guestPortal:
      isGuest && can.readIntake && can.createIntakeRequests,
    staffIntake: !isGuest && can.readIntake,
    canCreate: can.createIntakeRequests,
    canManage: can.manageIntake,
  };
}
```

`get-workspace-membership.ts` mirrors `get-my-capabilities.ts`; the hook uses key `["workspace-membership", workspaceId]`, `staleTime: 5 * 60_000`, and `enabled: Boolean(workspaceId)`.

- [ ] **Step 7: Run everything, then commit**

```
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts intake-surfaces
pnpm --filter @kaneo/permissions test
node node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/tsc.js -p apps/api/tsconfig.json --noEmit
```

```bash
git add apps/api/src/workspace apps/api/src/workspace-members packages/permissions \
  apps/web/src/hooks apps/web/src/fetchers/workspace apps/web/src/components/intake \
  apps/docs/openapi.json tests/api-integration/workspace-membership-kind.test.ts
git commit -m "feat: workspace membership kind separates guests from staff"
```

### Task 2: Guest invitations are bounded to selected projects

The API already accepts the `guest` role on an invitation, and nothing stops an admin from choosing "all projects" or from being invited as a guest and later silently re-roled. **Correction (2026-11-24): no UI can create a guest.** `invite-team-member-modal.tsx` hardcodes `role: "member"` (there is a `// TODO: role and email` there), and the members-table role `Select` lists only `viewer`, `member`, `admin` plus custom roles — `guest` is filtered out because it is a `DEFAULT_ROLE_NAMES` entry. The spec's dedicated "Invite guests" entry (§8, MVP item 6) was never built, so guests can only be created through the database today. Task 2's server guard is still correct and tested; the missing entry is tracked as the Phase 3.1 follow-up.

**Files:**
- Modify: `apps/api/src/project-access/resolve-project-access-request.ts`
- Test: `tests/api-integration/project-access-management.test.ts` (append a `describe`)

**Interfaces:**
- Produces: `resolveProjectAccessRequest` returns `{ ok: false, status: 400, message: "Guests can only be given selected projects" }` when `projectAccess === "all"` and `isGuestRole(targetRole)`. Shared by the invitation path (`resolve-invitation-project-access.ts`) and `update-member-project-access`, so both the invite and any later access change are bounded.
- Role changes that leave guest: the existing role update path keeps working (staff may re-role a guest deliberately); what must not happen is an *invitation acceptance* granting more than the invited role. That is already enforced by `normalizeInvitationRole` + `applyInvitationProjectAccess`; the test below pins it.

- [ ] **Step 1: Write the failing tests** (append to `project-access-management.test.ts`)

```ts
describe("guest invitations", () => {
  it("rejects all-project access for a guest invitation", async () => {
    // same arrange as "applies the invitation's project selection when it's accepted",
    // but role "guest", projectAccess "all", no projectIds
    // expect 400 + message "Guests can only be given selected projects"; no invitation row
  });
  it("accepts a guest invitation limited to selected projects", async () => {
    // role "guest", projectAccess "selected", projectIds [project.id] → 200
  });
  it("rejects lifting an existing guest to all-project access", async () => {
    // PUT /workspace/{id}/members/{userId}/project-access { projectAccess: "all" } → 400
  });
  it("accepting a guest invitation keeps the member role guest", async () => {
    // accept the invitation, then GET /workspace/{id}/membership as that user → kind "guest"
  });
});
```

- [ ] **Step 2: Run — expect failure.**
- [ ] **Step 3: Implement** — inside `if (projectAccess === "all")` in `resolve-project-access-request.ts`, before the restricted-actor branch:

```ts
if (isGuestRole(request.targetRole)) {
  return {
    ok: false,
    status: 400,
    message: "Guests can only be given selected projects",
  };
}
```

- [ ] **Step 4: Run — expect pass**, then remove the disposable container.
- [ ] **Step 5: Commit** — `git commit -m "fix: guests can only be given selected project access"`

### Task 3: Guest badge in members + server-side assignee filtering

Guests appear in the workspace members table (phase 1) and in the assignee picker, because `GET /workspace/{id}/members?projectId=` returns every member with project access. A guest must not be assignable, and the picker must not offer them.

**Files:**
- Modify: `apps/api/src/utils/assert-assignable-user.ts` (`filterAssignableUsers` excludes guest memberships)
- Modify: `apps/api/src/import/writer/load-assignable-members.ts` (same exclusion, import path)
- Modify: `apps/api/src/workspace/schema.ts` (`workspaceMembersQuery.assignable`)
- Modify: `apps/api/src/workspace/controllers/get-workspace-members.ts` (+ pass-through), `apps/api/src/workspace/index.ts` (route handler passes the query value)
- Test: `tests/api-integration/assignable-guests.test.ts` (new), `tests/api-integration/workspace-membership-kind.test.ts` (append the members query test)
- Modify: `apps/web/src/fetchers/workspace-user/get-project-members.ts` (send `assignable: true`), `apps/web/src/hooks/queries/workspace-users/use-get-project-members.ts` if it needs the flag threaded
- Modify: `apps/web/src/components/team/members-table.tsx` (guest badge, read-only role cell)
- Modify: `i18n/en-US.json` (`team:roles.guest`)

**Interfaces:**
- `filterAssignableUsers(userIds, workspaceId)` returns a set without members whose `workspace_member.role` is a guest role. Every task-assignment path already funnels through it (`assertAssignableUser` for create/update/bulk, `loadAssignableMembers` for import), so one change covers them all.
- `GET /workspace/{id}/members?projectId=&assignable=true` omits guests; `assignable` without `projectId` is allowed (the workspace member list is unfiltered unless asked). Parse it the house way — `z.enum(["true", "false"]).optional()` as `assignedTasksQuery.countOnly` does — **not** `z.coerce.boolean()`, which turns the string `"false"` into `true`.
- Members table: a guest row renders a read-only `Badge` ("Guest") exactly like the owner row, instead of the role `Select` (which today has no `guest` option and would show a blank trigger).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/api-integration/assignable-guests.test.ts
it("refuses to assign a task to a guest", async () => {
  // guest with project access; PUT /task/assignee/{id} { userId: guest.user.id } → 403
});
it("refuses to create a task assigned to a guest", async () => { /* POST /task … userId: guest → 403 */ });
it("keeps a regular member assignable", async () => { /* 200 */ });

// workspace-membership-kind.test.ts
it("hides guests from an assignable member query", async () => {
  // project has a guest + a member with access
  // GET /workspace/{id}/members?projectId=…&assignable=true → only the member
  // GET …/members?projectId=… (no flag) → both, so the members surface is unchanged
});
```

- [ ] **Step 2: Run — expect failure.**
- [ ] **Step 3: Implement** the API filter (`select role as well; drop rows where isGuestRole(role)` in both helpers), the `assignable` query flag (default false; `z.enum(["true", "false"]).optional()` — **not** `z.coerce.boolean()`), then the picker flag and the members-table badge.
- [ ] **Step 4: Run — expect pass**

```
cd apps/api && DATABASE_URL=… pnpm exec vp test run --config vitest.integration.config.ts assignable-guests workspace-membership-kind
pnpm i18n:check:fix
```
Manual: members page shows a "Guest" badge for a guest row with no role dropdown; the task assignee picker no longer lists that guest.

- [ ] **Step 5: Commit** — `git commit -m "feat: guests are not assignable and show as guests in members"`

### Task 4: Intake data layer (fetchers + hooks)

No UI yet. No tests: these are thin wrappers in house style (`HttpError.fromResponse` + query keys); the behaviour that matters is covered by Phase 2 integration tests and the UI tests later.

**Files (all create):**
- `apps/web/src/fetchers/intake/list-intake-requests.ts`
- `apps/web/src/fetchers/intake/get-intake-request.ts`
- `apps/web/src/fetchers/intake/list-intake-projects.ts`
- `apps/web/src/fetchers/intake/list-intake-activity.ts`
- `apps/web/src/fetchers/intake/create-intake-request.ts`
- `apps/web/src/fetchers/intake/update-intake-request.ts`
- `apps/web/src/fetchers/intake/transition-intake-request.ts`
- `apps/web/src/fetchers/intake/attach-intake-task.ts`
- `apps/web/src/hooks/queries/intake/use-get-intake-requests.ts`
- `apps/web/src/hooks/queries/intake/use-get-intake-request.ts`
- `apps/web/src/hooks/queries/intake/use-get-intake-projects.ts`
- `apps/web/src/hooks/queries/intake/use-get-intake-activity.ts`
- `apps/web/src/hooks/mutations/intake/use-create-intake-request.ts`
- `apps/web/src/hooks/mutations/intake/use-update-intake-request.ts`
- `apps/web/src/hooks/mutations/intake/use-transition-intake-request.ts`
- `apps/web/src/hooks/mutations/intake/use-attach-intake-task.ts`
- `apps/web/src/types/intake.ts` (types derived from fetcher return values; follow the `apps/web/src/types/workspace-user/` folder style)

**Interfaces:** copy `apps/web/src/fetchers/project/get-project.ts` (`client.intake…`, `HttpError.fromResponse`). Endpoint mapping:

| fetcher | call |
|---|---|
| `listIntakeProjects` | `client.intake.workspaces[":workspaceId"]["intake-projects"].$get({ param })` |
| `listIntakeRequests` | `client.intake.workspaces[":workspaceId"]["intake-requests"].$get({ param, query })` (`projectId`, `status`, `page`, `limit`) |
| `createIntakeRequest` | `…["intake-requests"].$post({ param, json: { projectId, title, description } })` |
| `getIntakeRequest` | `client.intake.requests[":requestId"].$get` |
| `updateIntakeRequest` | `client.intake.requests[":requestId"].$patch({ json: { title?, description? } })` |
| `transitionIntakeRequest` | `client.intake.requests[":requestId"].transition.$post({ json: { to, note? } })` |
| `listIntakeActivity` | `client.intake.requests[":requestId"].activity.$get` |
| `attachIntakeTask` | `client.intake.requests[":requestId"].tasks.$post({ json: body })` — `body` is the existing `CreateTaskRequest` from `apps/web/src/fetchers/task/create-task.ts`; reuse that type |

Hook keys and invalidation:

```ts
// queries — object args, matching the fetcher inputs
useGetIntakeProjects(workspaceId)                   // ["intake-projects", workspaceId], staleTime 5m
useGetIntakeRequests({ workspaceId, projectId?, status?, page?, limit? })
                                                    // ["intake-requests", workspaceId, {…}], refetchInterval 30s
useGetIntakeRequest(requestId)                      // ["intake-request", requestId], refetchInterval 30s
useGetIntakeActivity(requestId)                     // ["intake-activity", requestId], refetchInterval 30s

// every mutation invalidates: ["intake-requests"], ["intake-request", id], ["intake-activity", id]
// attach task additionally invalidates ["tasks", projectId] and ["assigned-tasks"]
```

- [ ] **Step 1: Implement the fetchers**, then the hooks.
- [ ] **Step 2: Typecheck** — `node …/tsc.js -p apps/web/tsconfig.json --noEmit` → clean. (`client.intake` types come from `@kaneo/api`'s `AppType`; a mismatch means a Phase 2 route was renamed.)
- [ ] **Step 3: Commit** — `git commit -m "feat(web): intake fetchers and query hooks"`

### Task 5: Shared intake UI pieces + i18n namespace

Everything the four surfaces reuse. No page yet.

**Files (all create under `apps/web/src/components/intake/`):**
- `intake-status.ts` — status order, label key, badge tone, terminal check, action maps
- `intake-status-badge.tsx`
- `intake-request-form-modal.tsx` — create request (title, description, project picker when no `projectId` prop)
- `request-note-dialog.tsx` — optional note textarea, `required` flag, used for reject / needs_revision
- `intake-activity-list.tsx` — `status_changed` renders as "New → Triaged" style copy from `eventData`
- `intake-progress.tsx` — `2/3` with a progress bar; props `{ taskCount, completedTaskCount }`
- `intake-request-list.tsx` — rows: displayId, title, status badge, project name (hidden when `projectId` prop set), updated time, progress, `onRowClick`
- `intake-request-detail.tsx` — header (REQ-id, title, status), description, progress, activity, `actions` slot
- `intake-access-gate.tsx` — given the resolved surfaces and a requirement, renders children or redirects
- Test: `apps/web/src/components/intake/intake-status.test.ts`

**Interfaces:**

```ts
export const INTAKE_STATUSES = [
  "new", "triaged", "rejected", "approved",
  "in_progress", "delivered", "needs_revision", "confirmed",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];
export const isIntakeStatus = (value: string): value is IntakeStatus => …;

export type TransitionTarget = Exclude<IntakeStatus, "new">;
export type IntakeAction = { to: TransitionTarget; noteRequired: boolean };

// Mirrors spec §5. The API is the authority; these maps only decide what to render.
export function guestActionsFor(status: IntakeStatus): IntakeAction[];
export function staffActionsFor(status: IntakeStatus): IntakeAction[];
export const isTerminalStatus = (status: IntakeStatus): boolean;
```

`guestActionsFor("delivered")` → `[{ to: "confirmed", noteRequired: false }, { to: "needs_revision", noteRequired: true }]`, every other status → `[]`.
`staffActionsFor` → the manage rows of the spec table: `new` → `triaged`, `approved`, `rejected`; `triaged` → `approved`, `rejected`; `approved`/`needs_revision` → `in_progress`; `in_progress` → `delivered`; `delivered`/`confirmed`/`rejected` → `[]`. `rejected` carries `noteRequired: true`.

- [ ] **Step 1: Write the failing test**

```ts
describe("guestActionsFor", () => {
  it("offers confirm and revision only on delivered", () => {
    expect(guestActionsFor("delivered")).toEqual([
      { to: "confirmed", noteRequired: false },
      { to: "needs_revision", noteRequired: true },
    ]);
    for (const status of INTAKE_STATUSES.filter((s) => s !== "delivered")) {
      expect(guestActionsFor(status)).toEqual([]);
    }
  });
});
describe("staffActionsFor", () => {
  it("matches the spec transition table", () => {
    expect(staffActionsFor("new").map((a) => a.to)).toEqual(["triaged", "approved", "rejected"]);
    expect(staffActionsFor("triaged").map((a) => a.to)).toEqual(["approved", "rejected"]);
    expect(staffActionsFor("approved").map((a) => a.to)).toEqual(["in_progress"]);
    expect(staffActionsFor("needs_revision").map((a) => a.to)).toEqual(["in_progress"]);
    expect(staffActionsFor("in_progress").map((a) => a.to)).toEqual(["delivered"]);
    for (const status of ["delivered", "confirmed", "rejected"] as const) {
      expect(staffActionsFor(status)).toEqual([]);
    }
    expect(staffActionsFor("new").find((a) => a.to === "rejected")?.noteRequired).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure.**
- [ ] **Step 3: Implement** the status module, then the components. Rules: use existing primitives (`components/ui/badge.tsx`, `button.tsx`, `alert-dialog`, plain rows like `components/home/up-next.tsx`); add no dependency; no status is ever rendered as a raw lowercase string; every string is a `t("intake:…")` key. Add the whole `intake` namespace to `i18n/en-US.json`: `status.*` (8 labels), `portal.*`, `detail.*`, `staff.*`, `errors.*`.
- [ ] **Step 4: Run tests + i18n sync** — `pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts intake-status`, then `pnpm i18n:check:fix && pnpm i18n:schema`.
- [ ] **Step 5: Commit** — `git commit -m "feat(web): shared intake status, list and detail pieces with i18n"`

### Task 6: Guest shell + workspace-level "My requests"

**Files:**
- Modify: `apps/web/src/components/nav-main.tsx`
- Modify: `apps/web/src/components/nav-projects.tsx`
- Modify: `apps/web/src/hooks/queries/task/use-get-assigned-tasks.ts` (optional `enabled` argument)
- Modify: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/index.tsx` (guest landing redirect, gated queries)
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/my-requests.tsx`
- Create: `apps/web/src/components/intake/guest-portal-page.tsx`
- Test: `apps/web/src/components/intake/intake-surfaces.test.ts` (add `navForSurfaces`)

**Interfaces:**
- `navForSurfaces(surfaces)` → `{ staffNav, projectsNav, portalNav }` = `{ staffIntake, staffIntake, guestPortal }`.
- **No staff query may fire for a guest.** `GET /task/assigned` requires `project:read` + `task:read` and `GET /project` requires `project:read`; a guest gets 403 on both, so the hooks must be disabled, not merely unrendered.
- Direct URLs to staff pages (`/projects`, `/members`, `/my-tasks`, `/inbox`) stay reachable by typing them, but the API answers 403 and those pages already render their error states — that is not a data leak, so no extra guard route in Phase 3. `shortcut:` no redirect wall for guests on staff URLs — add one if users report dead ends.
- Route 1 renders `GuestPortalPage` with no `projectId`: status filter chips, project column, "New request" (opens `IntakeRequestFormModal` with the `/intake-projects` picker), rows navigating to route 3.

- [ ] **Step 1: Write the failing nav test**

```ts
it("shows guests only the portal nav", () => {
  expect(navForSurfaces({ guestPortal: true, staffIntake: false, canCreate: true, canManage: false }))
    .toEqual({ staffNav: false, projectsNav: false, portalNav: true });
});
it("keeps the staff nav untouched for members and viewers", () => {
  expect(navForSurfaces({ guestPortal: false, staffIntake: true, canCreate: true, canManage: true }))
    .toEqual({ staffNav: true, projectsNav: true, portalNav: false });
});
```

- [ ] **Step 2: Run — expect failure.**
- [ ] **Step 3: Implement**

`nav-main.tsx`: `const identity = useGetWorkspaceMembership(workspaceId)` → `resolveIntakeSurfaces(...)` → `navForSurfaces`. Render Home/Inbox/My tasks/Members only when `staffNav`; add `{ title: t("intake:portal.nav"), icon: Inbox, url: \`${homeUrl}/my-requests\` }` when `portalNav`. While `isCheckingPermissions` or the membership query is loading, render neither set (no flash of staff items to a guest).

Gate the queries too, or a guest page load still 403s:

```ts
const { data: assignedTasks } = useGetAssignedTasks(
  workspace?.id,
  true,
  staffNav, // new third argument, default true; keep the existing call sites working
);
const { data: notifications = [] } = useGetNotifications(workspace?.id);
```

`use-get-assigned-tasks.ts`: add `enabled = true` as the third parameter and spread `enabled: Boolean(workspaceId) && enabled` into the query. `useGetNotifications` needs no change (it is user-scoped, no workspace permission).

`nav-projects.tsx`: pass `enabled: projectsNav` to `useGetProjects({ workspaceId, enabled: projectsNav })` **and** keep the `return null` after the hooks. Do not rely on the early return alone — the hook runs first and would fetch.

`workspace/$workspaceId/index.tsx`: compute `staffNav` the same way and pass it to the two queries it owns — `useGetAssignedTasks(workspaceId, false, staffNav)` and `useGetProjects({ workspaceId, enabled: staffNav }, true)` — otherwise the guest landing page 403s before its redirect runs. Then, when identity + capabilities have resolved and the caller is a guest, `<Navigate to="/dashboard/workspace/$workspaceId/my-requests" params={{ workspaceId }} replace />`.

`my-requests.tsx`: `createFileRoute("…/my-requests")` → `IntakeAccessGate requirement="guestPortal"` wrapping `WorkspaceLayout title={t("intake:portal.title")}` + `PageTitle` + `GuestPortalPage`.

`GuestPortalPage`: `useGetIntakeRequests({ workspaceId, status })`, filter chips (`all` + `INTAKE_STATUSES`), empty state, `Skeleton` while loading, error + retry (copy `components/project/board-load-error.tsx`), row click → route 3.

- [ ] **Step 4: Run tests, typecheck, look at it**

```
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts intake-surfaces
node node_modules/.pnpm/typescript@7.0.2/node_modules/typescript/lib/tsc.js -p apps/web/tsconfig.json --noEmit
```
Manual with a guest account: sidebar shows only "My requests"; `/dashboard/workspace/{id}` lands there; no project list; the network log shows **no** call to `/task/assigned`, `/project` or `/organization/list-members`. One 403 on `/organization/get-full-organization` is expected and pre-existing — `authClient.useActiveOrganization()` fires it on every page and `useActiveWorkspace` falls back to the organization list; do not chase it in this phase.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): guest intake shell and workspace my-requests page"`

### Task 7: Project-level guest portal (list + detail)

**Files:**
- Create: `apps/web/src/components/intake/guest-portal-layout.tsx`
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/requests.tsx`
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/requests.$requestId_.tsx`
- Create: `apps/web/src/components/intake/guest-request-detail.tsx`
- Test: `apps/web/src/components/intake/guest-request-detail.test.tsx`

**Interfaces:**
- `GuestPortalLayout({ workspaceId, projectId, title })` — own header: sidebar trigger, `WorkspaceCrumbSelect`, project name resolved from `useGetIntakeProjects(workspaceId)` (find by id), link back to `/my-requests`. **No `ProjectLayout`, no `useGetProject`, no `useGetColumns`.**
- Project name missing once the picker list is loaded → redirect to `/my-requests` (access was revoked).
- Route 3: `useGetIntakeRequest(requestId)` + `useGetIntakeActivity(requestId)`; `request.projectId !== projectId` → redirect to `/my-requests`. `IntakeRequestDetail` with `actions = guestActionsFor(status)`; revision opens `RequestNoteDialog required`. Confirmed shows `confirmedAt`, no action left.
- Guest title/description editing (PATCH) is **not** in Phase 3 (deferred).

- [ ] **Step 1: Write the failing test** (mock fetchers with `vi.mock`, wrap in `QueryClientProvider`)

```tsx
it("shows confirm and request-revision on a delivered request", () => {});
it("shows no action on confirmed", () => {});
it("refuses to submit a revision without a note", () => {});   // submit disabled
it("never renders linked task internals", () => {});           // payload without linkedTasks → progress only
```

- [ ] **Step 2: Run — expect failure.**
- [ ] **Step 3: Implement.** Transition errors go through `toast` + refetch (`409` = someone else moved it → `intake:errors.transitionConflict`).
- [ ] **Step 4: Run — expect pass**

```
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts guest-request-detail
node …/tsc.js -p apps/web/tsconfig.json --noEmit
```
Manual as a guest: open `/project/{id}/requests`, create a request, open it — no project tab bar, and no `client.project` call in the network log.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): project-level guest intake portal"`

### Task 8: Staff intake tab (list + detail)

**Files:**
- Modify: `apps/web/src/components/project/views/project-views.ts` (add `intake` to `ProjectRoute` + `PROJECT_ROUTE_PATHS` only)
- Modify: `apps/web/src/components/project/views/project-scope-toggle.tsx` (third link, gated)
- Modify: `apps/web/src/components/common/project-layout.tsx` (`resolvedRoute` detects `/intake`; `handleProjectSwitch` then works unchanged)
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/intake.tsx`
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/intake.$requestId_.tsx`
- Create: `apps/web/src/components/intake/staff-intake-page.tsx`
- Create: `apps/web/src/components/intake/staff-request-detail.tsx`
- Create: `apps/web/src/components/intake/attach-task-dialog.tsx`
- Test: `apps/web/src/components/intake/staff-request-detail.test.tsx`

**Interfaces:**
- `ProjectScopeToggle` gains `showIntake?: boolean` (from `ProjectLayout`, via `resolveIntakeSurfaces`) and `intakeActive?: boolean`, so nobody without `staffIntake` sees the tab and the toggle can show it as the current area.
- **`resolveProjectView` must not receive `"intake"`.** Adding `intake` to `ProjectRoute` makes `project-layout.tsx`'s `resolveProjectView(resolvedRoute, viewMode)` a type error (it returns `ProjectView`). In `ProjectLayout`: keep `resolvedRoute: ProjectRoute` (now possibly `"intake"`), then `const taskRoute = resolvedRoute === "intake" ? "board" : resolvedRoute;` for `currentView`, pass `intakeActive={resolvedRoute === "intake"}` to the toggle, and pass `showViews && resolvedRoute !== "intake"` as the **third positional argument** (`enabled`) of `useProjectViewShortcuts(goToView, currentView, enabled)` so the layout shortcuts do not fire from the intake tab. `PROJECT_ROUTE_PATHS[resolvedRoute]` in `handleProjectSwitch` then works unchanged.
- `staff-intake-page` groups **client-side from one page** in this order: "Needs triage" (`new`, `triaged`), "In progress" (`approved`, `in_progress`, `needs_revision`), "Awaiting guest" (`delivered`), "Closed" (`confirmed`, `rejected`). Each header shows its count.
- **Paging rule (do not silently hide work):** request `limit=100`; if `total > items.length`, render a banner "Showing {items.length} of {total} — filter by status to narrow" above the groups, and keep the status filter visible. Never render a group as if it were complete when the page is truncated. `shortcut:` client-side grouping over one page; upgrade to a per-status query when a project routinely exceeds 100 open requests.
- `staff-request-detail`: `IntakeRequestDetail` + `staffActionsFor(status)` buttons rendered only when `canUpdateIntake()` (a viewer holds intake `read` only and would get a 403) (`RequestNoteDialog` for note-required transitions), linked tasks (`linkedTasks`, each linking to `/project/$projectId/task/$taskId`), `Attach task` when status ∈ {`approved`, `in_progress`, `needs_revision`} and `canManageIntake() && canCreateTasks()`, activity list.
- `attach-task-dialog`: title, description, priority, status; status options from `useGetColumns(projectId)`, default the first column slug; submits the existing `CreateTaskRequest` shape through `attachIntakeTask`.
- Guard on both routes: `IntakeAccessGate requirement="staffIntake"` → redirect to the project `board`. Component-level gate only; the API rejects everything a guest would try. `shortcut:` no `beforeLoad` capability gate — add one if the brief flash becomes visible.

- [ ] **Step 1: Write the failing test**

```tsx
it("offers triage actions on a new request and hides attach-task", () => {});
it("offers attach-task inside the attach window only", () => {});   // approved/in_progress/needs_revision
it("offers no transition on confirmed or rejected", () => {});
it("hides every transition from a viewer who can only read intake", () => {});   // canUpdateIntake false
it("shows linked tasks for staff", () => {});
```

- [ ] **Step 2: Run — expect failure.**
- [ ] **Step 3: Implement.** Keep `ProjectView` untouched: add `intake` to `ProjectRoute` and `PROJECT_ROUTE_PATHS` only; `ProjectScopeLink` is typed to `ProjectView`, so the Intake tab is a small sibling link component using the same classes.
- [ ] **Step 4: Run — expect pass**

```
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts staff-request-detail
node …/tsc.js -p apps/web/tsconfig.json --noEmit
```
Manual as a member: `Tasks | Backlog | Intake`; approve a `new` request; deliver it; attach a task; the linked task shows on the board and in the detail; as the guest, confirm and watch `Confirmed` render after polling.

- [ ] **Step 5: Commit** — `git commit -m "feat(web): staff intake tab with triage, transitions and task attachment"`

### Task 9: Gates, route tree, docs, acceptance checks

**Files:**
- Regenerated: `apps/web/src/routeTree.gen.ts`
- Regenerated/verified: `apps/docs/openapi.json` (Task 1 added one operation; Task 3 added one query param)
- Modify: `apps/docs` intake/workspace API page if one exists (mirror Phase 2's docs; skip if the site renders from the spec)

- [x] **Step 1: Regenerate the route tree and inspect the diff.** Start `pnpm --filter @kaneo/web dev`, wait for `routeTree.gen.ts` to be rewritten, stop the server (web tests do not run the router plugin). Expected: exactly the five new route ids from the route map, no changed existing parents, `/project/$projectId/index` still redirecting to `board`.
  - Done in `4773ae7e`, `0a27f114`, `f2750710`. All five ids are present (`/project/$projectId/intake`, `/project/$projectId/intake/$requestId`, `/project/$projectId/requests`, `/project/$projectId/requests/$requestId`, `…/my-requests`), and `project/$projectId/index.tsx` still redirects to `board`.

- [x] **Step 2: Confirm guests still cannot reach staff surfaces**

```bash
grep -rn "useGetProject\|useGetColumns\|useGetTasks\|client.project" \
  apps/web/src/components/intake apps/web/src/routes/_layout/_authenticated/dashboard/workspace/\$workspaceId/my-requests.tsx \
  apps/web/src/routes/_layout/_authenticated/dashboard/workspace/\$workspaceId/project/\$projectId/requests.tsx \
  apps/web/src/routes/_layout/_authenticated/dashboard/workspace/\$workspaceId/project/\$projectId/requests.\$requestId_.tsx
```

Expected: one allowlisted match, `components/intake/attach-task-dialog.tsx`. It reads `useGetColumns` but is staff-only: it is rendered from `staff-request-detail` behind `canManageIntake() && canCreateTasks()`, and no guest route or guest component imports it. Anything else matching the pattern is a regression.

- [x] **Step 3: Run the gates**

```
pnpm i18n:check
pnpm openapi:check
node …/tsc.js -p apps/web/tsconfig.app.json --noEmit   # alone (WSL memory)
node …/tsc.js -p apps/api/tsconfig.json --noEmit       # alone (WSL memory)
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts intake
pnpm exec vp check
```

`tsconfig.app.json`, not `tsconfig.json` — the latter is a solution config with `"files": []`, so it typechecks nothing and always exits 0.

Results: i18n in sync, `apps/docs/openapi.json` unchanged after export, both typechecks clean, 4 intake test files / 23 tests pass, `vp check` clean.

- [ ] **Step 4: Manual end-to-end pass** (one browser, two accounts) — **still open.** Everything below is covered by unit/integration tests; this pass is the only check that the screens actually work together in a browser.

Guest: sidebar is only "My requests" → create a request from the workspace page → open the project portal from the row → detail shows progress 0/0 and the created activity.
Staff: intake tab → request under "Needs triage" → approve → attach a task → deliver.
Guest: `Delivered` → confirm → `Confirmed`, no action left. Second request: staff delivers, guest requests a revision with a note, staff sees `Needs revision` and the note in the activity.
Members: the guest row shows the "Guest" badge and no role dropdown; the assignee picker does not offer the guest.

- [ ] **Step 5: Acceptance checklist** (all must hold before the PR)

- [x] Guest vs staff identity comes from membership (`GET /workspace/{id}/membership`); no surface gate reads `task:read` or a browser-side role name. — `workspace-membership-kind.test.ts`, `intake-surfaces.test.ts`.
- [x] A guest invitation with `all` project access is rejected; a guest stays `kind: "guest"` after accepting. — `resolve-project-access-request` tests plus the integration suite.
- [x] Guests are rejected as assignees by the API, and hidden from the assignee picker; the members table shows a Guest badge. — `assignable-guests.test.ts`, `assert-assignable-user` tests.
- [x] The three surfaces (workspace portal, project portal, staff intake) have their own routes and gates; a guest gets nothing from the staff routes. — route tree above, `IntakeAccessGate`, guest routes never mount `ProjectLayout`.
- [ ] Guests see no `linkedTasks`; staff see linked tasks and progress. — implementation only; confirm in Step 4.
- [ ] Request and task stay separate (progress is display-only). — confirm in Step 4.
- [x] Tests exist for the identity endpoint, the invitation guard, assignability, the surface/nav resolver, the status maps, and the guest/staff detail action gating.
- [x] `pnpm i18n:check`, `pnpm openapi:check`, web typecheck, focused vitest and `vp check` are green.

- [x] **Step 6: Commit + push** — `git commit -m "chore: regenerate route tree and verify intake gates"`, push `feature/intake-portal`, watch fork CI to green. — Landed as `4773ae7e`, `0a27f114`, `f2750710` and the three CI fixes below; Fork CI `45346044213` is green.

## CI fixes after the first push

The first Fork CI run found three real type errors that the local gate missed, because `apps/web/tsconfig.json` is a solution config with `"files": []` and typechecks nothing. Always use `apps/web/tsconfig.app.json`.

| Commit | Fix |
| --- | --- |
| `625305d1` | The intake router was mounted with a bare `api.route("/intake", intake)`, so it never entered the `AppType` union and `client.intake` was untyped. Routers must be destructured from `createApp()`'s return value. Also `resolveProjectView` now takes `Exclude<ProjectRoute, "intake">`. |
| `8b2e03d6` | Test fixtures used `Date` where the API returns ISO strings; fetcher query objects were wider than the Zod schema (`page`/`limit` always present, `status` narrowed). |
| `b7f3afd9` | `transition` accepts seven targets, not `"new"`: `to: Exclude<IntakeRequestListItem["status"], "new">`. |

## Scope decisions (agreed)

| Item | Decision |
|---|---|
| Workspace guest portal | Phase 3 |
| Project guest portal (list + detail) | Phase 3 |
| Staff intake management (list + detail) | Phase 3 |
| Guest invitation, bounded to selected projects | Phase 3 |
| Guest badge in members | Phase 3 |
| Assignee filtering (server-side) | Phase 3 |
| Guest/staff identity separation | Phase 3 |
| Notifications (spec §11) | Phase 4 |
| Guest in-portal title/description editing (PATCH exists) | Phase 4 |
| Dedicated "Invite guests" settings entry | **Missing from Phase 3 — build as Phase 3.1.** The spec lists it as MVP item 6 (§8, §12) and the earlier claim that "the existing invite modal already offers the `guest` role" was wrong: the modal hardcodes `role: "member"` and the members-table select filters `guest` out. Until it exists, a guest can only be created by editing `workspace_member.role` directly, so the invite half of the feature is unreachable from the product. |
| Standalone/shareable project portal URL (no account) | Phase 5 — the in-app project portal route is the shape it will render; auth for it is a separate design |
| API/Slack/Telegram/AI intake channels | Later phases (spec §13) |

## Deferred (explicitly not in Phase 3)

- **Notifications** (spec §11 bold rows): the `intake_request` notification resourceType, in-app entries, and transactional guest emails. Touches the notification pipeline, preference gates and `@kaneo/email` templates — not UI.
- **Guest in-portal title/description editing** (API `PATCH` exists).
- **Dedicated "Invite guests" settings entry** — not deferred after all: it is MVP item 6 of the spec and was missed (see the scope table). Phase 3.1.
- **Standalone shareable portal URL** — Phase 5. The Phase 3 routes do not lock it in: the project portal page is addressed by workspace + project id and reads everything through the intake API, so a tokenized entry point can later render the same components.
