# Intake Portal — design spec

- **Status:** Draft (pending review)
- **Date:** 2026-11-24
- **Branch:** `feature/intake-portal`
- **Delivery:** three stacked PRs on this branch, in section 12 order —
  (1) foundation: migration + permissions, (2) API + realtime, (3) UI +
  notifications. Each phase lands green (typecheck + focused tests) and is
  reviewed before the next starts; repo-wide checks run on the final PR.
- **Area:** API, web, database migration, permissions package, docs, OpenAPI
- **Terminology:** External requesters are **Guests** everywhere (role name
  `guest`, UI "Guest", i18n keys). Never "customer".

## 1. Intent

Kaneo workspaces receive work requests from people outside the team today
by informal channels (chat, email, verbal). There is no tracked object for
"what was asked" — only tasks, which describe "what we did". This spec adds
the **Intake Portal**: guests submit **Intake Requests**, staff triage,
execute, deliver, and the guest confirms the delivery.

Two domain objects stay separate by design:

- **Intake Request** — the guest's business need, with its own lifecycle
  that runs from submission to guest confirmation.
- **Task** — internal work created to fulfil an approved request, using
  Kaneo's existing task workflow unchanged.

One request can link to many tasks; a task belongs to at most one request.
The lifecycles are never auto-coupled: finishing every linked task does not
move the request.

## 2. Approaches considered

| Approach | Summary | Why not / why yes |
|---|---|---|
| Plane-style hybrid | Submitting creates a draft task plus a triage wrapper; accept = flip status | Rejected: rejected/snoozed requests would consume `task_project_number_unique`, pollute boards, and cannot model one-request-many-tasks without a link table anyway. Conflicts with the core separation decision. |
| Email-token portal (no accounts) | Guest gets signed links by email; public page per request | Rejected for MVP: no aggregate view for guests, weaker audit, and the ownership/authorization work is needed either way. Keep as fallback if guest account overhead proves too heavy in practice. |
| Guest member via existing invitation (**chosen**) | Guests are workspace members with a seeded `guest` role, invited through the existing Better Auth organization invitation with `selected` project access; Intake Request is a new independent entity | Reuses invitation, project access, permissions, email, sessions; the only genuinely new authorization primitive is per-request ownership scoping. |

## 3. Decisions already made with the user

1. `guest` is a new default workspace role, seeded like
   `viewer`/`member`/`admin` (added to `DEFAULT_ROLE_NAMES` and
   `defaultRolePayloads` in `@kaneo/permissions`; boot-time backfill covers
   existing workspaces).

   Stored `workspace_role` rows **replace** the compiled role definitions,
   and the seeder only inserts missing rows — so new workspaces alone
   would never grant intake permissions to existing staff. Migration
   policy (implementer's call, add-only and non-destructive): for the
   three default-named roles (`viewer`, `member`, `admin`) in every
   workspace, merge the new `intakeRequest` actions into the stored
   payload in place (write back old actions plus the added ones). Rows for
   non-default role names are never touched. This keeps intake functional
   in every existing workspace and cannot remove anything an admin added.
2. Guests join via the existing workspace invitation flow with project
   access mode `selected`. No `all` access, no new auth flows.
3. Guests and seats: billing logic (`syncWorkspaceSeats` and friends) is
   left untouched in MVP, per the self-host-first posture. Consequence,
   stated plainly: seat limits **exist today** on billing-enabled (Creem
   team plan) instances, and because seats count all `workspaceUserTable`
   rows, guests will consume seats there. Self-hosted instances with
   billing disabled are unaffected. Excluding guests from seat counts is a
   small, isolated follow-up (`sync-seats.ts`, billing overview, and the
   reconciliation query), deliberately deferred — not treated as "future
   SaaS only".
4. `intake_request` is a new table; `task.intakeRequestId` is a new nullable
   FK. No junction table.
5. Tasks are created only for approved requests; rejected requests are kept
   for history and never spawn tasks.
6. Request status changes are always human decisions (PM or guest). The
   system never derives request status from task status; it only displays
   linked-task progress (e.g. "2/3 tasks completed").
7. `CONFIRMED` is terminal; a request is never reopened or deleted.
   New needs after confirmation become new requests.
8. The portal is the only channel in MVP. Slack/Telegram/AI/raw-API intake
   is a later phase (section 13) but the data model and service boundary
   are designed for it now.

## 4. Actors and permission matrix

There is no "PM" role in Kaneo. The staff side of intake is defined by a
new permission action; anyone holding it is an intake manager. By default
that is `member`, `admin`, `owner` (and instance admins via their existing
bypass).

New permission vocabulary in `@kaneo/permissions`:

```ts
intakeRequest: ["create", "read", "update", "manage"]
```

| Capability | guest | viewer | member | admin | owner |
|---|---|---|---|---|---|
| Create request in intake-enabled accessible project | ✅ | — | ✅ | ✅ | ✅ |
| List/read own requests | ✅ | — | ✅ | ✅ | ✅ |
| Request revision / confirm delivery (own request, valid status) | ✅ | — | ✅ | ✅ | ✅ |
| Read all requests in accessible projects | — | ✅ | ✅ | ✅ | ✅ |
| Triage: approve / reject (with note) | — | — | ✅ | ✅ | ✅ |
| Deliver (`DELIVERED`), reopen revision to `IN_PROGRESS` | — | — | ✅ | ✅ | ✅ |
| Create / link tasks for a request | — | — | ✅ | ✅ | ✅ |
| Read internal tasks/projects | — | ✅ (unchanged) | ✅ | ✅ | ✅ |

`guest` gets **no** `project:*`, `task:*`, `label:*`, `workspace:*`
actions, and — mirroring how `viewer` is built — its better-auth
organization surface is exactly `memberAc` statements (no organization,
member, invitation, or team actions beyond `ac: ["read"]`), so guests
cannot list members, see emails, or invite anyone. Concrete guest payload:

```ts
export const guest = ac.newRole({
  ...memberAc.statements,
  intakeRequest: ["create", "read", "update"],
});
```

`viewer` gets `intakeRequest: ["read"]` so internal read-only
users can see the intake list of projects they can access.

### Ownership enforcement (the one new primitive)

Kaneo has workspace-role permissions and project access, but no generic
row-level ownership. The Intake API enforces it itself, on **every**
route, not just list:

- Resolve actor roles once per request (reuse the `memberRoles` /
  `workspacePermissionChecker` pattern).
- **Manage path** (`intakeRequest: ["manage"]` satisfied): full access to
  requests inside projects the actor can access (`assertProjectAccess`).
- **Guest path**: `createdById === actor id` on every read, update, and
  action; otherwise 404 (not 403 — do not confirm existence, matching the
  existing not-found convention for inaccessible resources).
- Guest mutations (`revision`, `confirm`) additionally validate the
  current status allows the transition (section 6).
- UI hiding is never trusted; the API is the boundary.

## 5. Business workflow and state transitions

```
NEW ──► TRIAGED ──┬──► REJECTED (terminal)
                  └──► APPROVED ──► IN_PROGRESS ──► DELIVERED ──┬──► CONFIRMED (terminal)
                                                                └──► NEEDS_REVISION ──► IN_PROGRESS
```

Transition map (enforced centrally in the intake service; illegal
transitions return `409 REQUEST_STATUS_TRANSITION`):

| From | To | Actor | Notes |
|---|---|---|---|
| `NEW` | `TRIAGED` | manage | PM picked it up for review |
| `NEW`/`TRIAGED` | `REJECTED` | manage | requires a note (stored in intake activity) |
| `NEW`/`TRIAGED` | `APPROVED` | manage | precondition for task creation |
| `APPROVED` | `IN_PROGRESS` | manage | first task work starts |
| `IN_PROGRESS` | `DELIVERED` | manage | PM asserts delivery to guest; never automatic |
| `DELIVERED` | `NEEDS_REVISION` | guest (owner) | requires a note describing what to change |
| `DELIVERED` | `CONFIRMED` | guest (owner) | sets `confirmedAt`, `confirmedVia` |
| `NEEDS_REVISION` | `IN_PROGRESS` | manage | PM accepts the revision, creates tasks |

Rules:

- Task attach window: `APPROVED`, `IN_PROGRESS`, `NEEDS_REVISION`. Creating
  or linking a task is rejected in every other status
  (`409 REQUEST_NOT_TASK_ATTACHABLE`).
- Revision of the original scope continues on the same request; new needs
  or scope changes are new requests. Old tasks are kept (history), revision
  work goes on new tasks.
- `CONFIRMED`/`REJECTED` are terminal: no transitions out, no task
  attach, no reopening. `DELETE` is not exposed.

## 6. Data model

New tables in `apps/api/src/database/schema.ts`; migration via
`pnpm --filter @kaneo/api db:generate`, SQL inspected by hand before use.

```ts
export const intakeRequestTable = pgTable("intake_request", {
  id: text("id").$defaultFn(() => createId()).primaryKey(),
  projectId: text("project_id").notNull().references(() => projectTable.id, {
    onDelete: "cascade", onUpdate: "cascade",
  }),
  number: integer("number").default(1).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("new"), // new|triaged|rejected|approved|in_progress|delivered|needs_revision|confirmed
  createdById: text("created_by_id").notNull().references(() => userTable.id, {
    onDelete: "restrict", onUpdate: "cascade",
  }),
  // Requester ≠ creator: for future channels the submitter may be an
  // integration while a human asked for the work. Null on guest-portal
  // requests, where the requester is the creator.
  requesterName: text("requester_name"),
  requesterEmail: text("requester_email"),
  sourceType: text("source_type").notNull().default("guest_portal"),
  sourceId: text("source_id"),
  externalReference: text("external_reference"),
  confirmedAt: timestamp("confirmed_at", { mode: "date" }),
  confirmedVia: text("confirmed_via"), // "guest_portal" in MVP
  createdAt: timestamp("created_at", { mode: "date" }).default(utcNow).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).default(utcNow)
    .$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("intake_request_createdById_idx").on(table.createdById),
  index("intake_request_projectId_status_idx").on(table.projectId, table.status),
  unique("intake_request_project_number_unique").on(table.projectId, table.number),
]);
```

No standalone `projectId` index (the composite's left prefix covers it) and
no dedup index in MVP: nothing writes `externalReference` yet. The future
API channel adds its own partial-unique index with its real dedup
semantics when it lands.

export const intakeActivityTable = pgTable("intake_activity", {
  id: text("id").$defaultFn(() => createId()).primaryKey(),
  intakeRequestId: text("intake_request_id").notNull()
    .references(() => intakeRequestTable.id, {
      onDelete: "cascade", onUpdate: "cascade",
    }),
  type: text("type").notNull(),   // created|status_changed|revision_requested|confirmed|note_added|task_linked…
  userId: text("user_id").references(() => userTable.id, {
    onDelete: "set null", onUpdate: "cascade",
  }),
  content: text("content"),       // e.g. rejection note, revision note
  eventData: jsonb("event_data"), // e.g. { from: "new", to: "rejected" }
  createdAt: timestamp("created_at", { mode: "date" }).default(utcNow).notNull(),
}, (table) => [
  index("intake_activity_requestId_idx").on(table.intakeRequestId),
]);
```

Changes to existing tables:

- `task.intakeRequestId`: nullable FK → `intake_request.id`,
  `onDelete: "set null"` (a task must survive even if request rows are ever
  removed by an admin migration), indexed.
- `project.intakeEnabled`: boolean, default `false`. Only projects with the
  flag accept new requests. Independent from project access: access grants
  visibility, the flag gates submission.

Numbering: `number` is per-project, using the same counter pattern as
tasks (`project.lastTaskNumber`): a `project.lastIntakeRequestNumber`
column, incremented inside the same transaction as insert, surfaced as
the human identifier (display form `REQ-<number>`).

Deliberately **not** denormalized: no `workspaceId` column — requests
resolve their workspace through the project join, exactly like tasks do
today.

No attachments in MVP (existing storage infra is not wired for intake;
listed for the intake-form phase).

## 7. API design

All routes under the existing Hono `createRoute` conventions, Zod request
/response schemas, `HTTPException`/`ApiError`, OpenAPI descriptions kept
accurate (`pnpm openapi:check:fix` after changes). Middleware order on
`createRoute` is respected: access middleware reads the raw request, never
`c.req.valid()`.

| Method & path | Actor | Notes |
|---|---|---|
| `GET /api/v1/workspaces/{wsId}/intake-projects` | guest, manage | `id` + `name` of intake-enabled projects where the actor has access; the guest project picker — no `project:*` needed, gated by `intakeRequest: ["create"]` |
| `GET /api/v1/workspaces/{wsId}/intake-requests?projectId=&status=` | guest: own only; manage: all in accessible projects | paginated; embeds linked-task progress counts (one grouped query) and display-only `projectName` for guests |
| `POST /api/v1/workspaces/{wsId}/intake-requests` | guest, manage | body: `projectId`, `title`, `description`; validates `project.intakeEnabled` + project access; sets `createdById` |
| `GET /api/v1/intake-requests/{id}` | ownership path as above | includes linked tasks (id, number, title, status — staff view) and task progress summary; guest view omits task internals, shows only the progress count |
| `PATCH /api/v1/intake-requests/{id}` | guest: own, `NEW` only (fix typos) | status changes are not done via PATCH; manage-side text edits are not in MVP |
| `POST /api/v1/intake-requests/{id}/transition` | manage or guest per transition map | body: `to`, optional `note`; service enforces map + ownership |
| `GET /api/v1/intake-requests/{id}/activity` | ownership path | audit trail |
| `POST /api/v1/intake-requests/{id}/tasks` | manage | body: existing task-create payload; wraps current task creation in the same transaction with the `intakeRequestId` link and attach-window validation |

Triage-board progress comes embedded in the list/detail responses, not a
separate route.

Events `intake_request.created` / `intake_request.updated` (status, edits)
still fire via the existing `publishEvent`, so the WebSocket layer can hook
in later without touching the service. MVP delivery is **polling only**:
TanStack Query `refetchInterval` (~30s) on portal and triage lists, plus
cache invalidation after each action.

`shortcut:` live intake updates can lag up to ~30s — add the ws recipient
rule (deliver intake events to `manage` holders with project access plus
the request owner) when a client actually notices the lag.

## 8. UI/UX flow

**Guest portal** (`apps/web`, gated by the capability map, route visible
only when the workspace resolves `intakeRequest: ["read"]` without task
permissions):

- "My Requests" list: status badges, project name, updated time, filter by
  status. "New Request" button per intake-enabled accessible project.
- Request detail: title/description, status timeline (own + system activity
  in guest-readable types), linked-task progress ("2/3 completed"), and
  exactly one contextual action: **Confirm delivery** (`DELIVERED`) or
  **Request revision** (`DELIVERED`, note required).
- No task/board surfaces, no workspace settings, no member management.

**Staff intake view** (inside existing project page as a new tab,
"Intake"):

- Triage list (`NEW`/`TRIAGED` first) with approve/reject (note required on
  reject), then status-grouped views (`IN_PROGRESS` with linked tasks and
  progress, `DELIVERED` awaiting guest confirmation, closed).
- Request detail mirrors guest view plus task creation (existing task
  create flow, pre-linked) and full activity trail.

**Inviting guests** (workspace settings): a dedicated **"Invite guests"**
entry, separate from the member invite modal. It posts to the existing
better-auth invitation API with role `guest`, always uses `selected`
project access, and reuses the existing project-access selection UI. The
member modal stays untouched. The API rejects guest invitations with `all`
access (`400`) regardless of which UI called it.

All copy through i18n keys with `i18n/en-US.json` as the source.

## 9. Edge cases and validation

- **Project deleted** → requests cascade (same as tasks today). Activity
  cascades with the request.
- **Guest removed from workspace / invitation revoked** → requests remain
  (`createdById` is `restrict` on delete of the *user row*; workspace
  removal only ends access). Their requests stay visible to staff; the
  guest can no longer act. `user` deletion is blocked while their requests
  exist (`restrict`), surfaced as a clear error.
- **Duplicate submission** — no dedup in MVP for the portal (the guest
  intent is explicit); the future API channel brings its own dedup index
  when it lands.
- **Concurrent transitions** — status update runs in a transaction with a
  `WHERE status = <expected>` guard; zero rows → `409` with current status
  in the error payload.
- **Guest edits own request after triage starts** — locked at `TRIAGED`
  and beyond (`NEW` only); changes go through revision notes instead.
- **Revision storm** — unlimited revisions are allowed (business reality),
  each one is an audited activity entry; no hidden caps.
- **Invitation with `all` project access for a guest** — the invite UI
  restricts guest invitations to `selected`; the API rejects `all` for
  guest-role invitations (`400`).
- **intakeEnabled toggled off** with in-flight requests — existing
  requests continue their lifecycle; only new submissions are blocked.
- **Empty/oversized input** — Zod limits (title ≤ 200, description ≤ 10k),
  matching existing task validation posture.

## 10. Impact on existing Kaneo surfaces

| Surface | Impact | Handling |
|---|---|---|
| Workspace members list | guests appear | role badge "Guest"; filter chip; no behavior change otherwise |
| Assignee picker / `assert-assignable-user` | guests must not be assignable | filter guest-role members out of assignable lists; server-side assert rejects guest assignees |
| Task APIs | guests must not read/write tasks | already enforced: guests hold no `task:*` permissions → 403/404 via `requireWorkspacePermission` |
| Project APIs | guests must not read project internals | guests hold no `project:*`; intake responses embed display-only `projectName` server-side |
| Global search | guests must not surface internal data | search is access-filtered already; guests additionally hold no `task:*` — verify with one integration test, no change expected |
| WebSocket | guests must not join project channels | unchanged; intake updates ride polling (section 7), no ws change in MVP |
| Notifications | guest + PM touchpoints | section 11 |
| Billing/seats | none in MVP | decision recorded (section 3.3) |
| Audit logs | intake actions auditable | `intake_activity` is the domain trail; instance audit log unchanged |

## 11. Notifications and audit

Event → recipient matrix (architecture fixed now; MVP implements the
bold rows). The notification pipeline is resource-typed
(`task` | `workspace` today): intake adds an `intake_request` resourceType
threaded through `notificationResourceAccess`, `resolveNotificationContext`,
and the preference gates — staff notifications go through the existing
preference machinery unchanged. Guest-facing emails are treated as
**transactional** (like invitation emails today): not preference-gated,
since the portal has no notification-settings UI. Guests receive in-app
notifications in the portal without a preferences surface.

| Event | Recipients | Channel |
|---|---|---|
| **request created (by guest)** | staff with `manage` + project access on that project | in-app notification, existing notification service |
| **status changed to `REJECTED` / `DELIVERED` / revision reopened `IN_PROGRESS`** | request owner | in-app + email (transactional, `@kaneo/email` template) |
| **revision requested / delivery confirmed (by guest)** | staff with `manage` + project access | in-app |
| reminder: request sits in `NEW` for N days | staff with `manage` | later phase (scheduler pattern exists) |

Audit: every transition, note, task link, and guest action writes an
`intake_activity` row with the real `userId` (creator/actor), event data,
and timestamp. `confirmedAt`/`confirmedVia` on the request record capture
the confirmation fact redundantly for cheap queries.

## 12. MVP scope vs later

**In MVP (this spec's build):**

1. Migration: `intake_request`, `intake_activity`, `task.intakeRequestId`,
   `project.intakeEnabled`, `project.lastIntakeRequestNumber`.
2. `@kaneo/permissions`: `intakeRequest` vocabulary, `guest` default role +
   seeding/backfill + add-only merge into existing default-role rows.
3. Intake service + routes + ownership enforcement + transition map.
4. Guest portal UI (list, create, detail, confirm/revision).
5. Staff intake tab (triage, deliver, task linking, activity).
6. "Invite guests" settings entry (role `guest`, `selected` access only).
7. Realtime: polling only per section 7 (events publish now, ws rule
   deferred).
8. Bold notification rows in section 11, including the
   `intake_request` notification resourceType.
9. Members-table guest badge + assignee filtering.
10. OpenAPI + docs (`apps/docs`) + integration tests
   (`tests/api-integration`) covering ownership isolation, transition map,
   task attach window, and guest 404 behavior.

**Later phases (explicitly out of MVP):** attachments, intake form builder
(per-project forms), request custom fields, reminders/schedulers, CSV
export/analytics, integration management UI, AI assistance.

## 13. Multi-channel intake direction (design now, build later)

**Unified service:** every channel funnels into the same
`createIntakeRequest` service function and the same lifecycle/transition
map. No per-channel entities or workflows, ever. Channels differ only in
authentication and in how they fill `source*`/requester fields.

**Data model** (already in section 6, built in MVP even though only
`guest_portal` is used): `sourceType` (default `guest_portal`; future
`api`, `slack`, `telegram`, `ai_agent`), `sourceId`, `externalReference`
(its dedup index arrives with the API channel, not the MVP migration),
`requesterName`/`requesterEmail` kept
separate from `createdById` — the *creator* is the authenticated actor,
the *requester* is who asked.

**Authentication for future channels — reuse, don't build:** Better Auth
API keys already exist (`apikeyTable` with permission scopes, rate
limiting, expiry, and `requireApiKeyScope` enforcement). An external
system gets a workspace API key scoped to
`intakeRequest: ["create", "read"]` on a dedicated integration user; that
user's `selected` project access bounds what the integration can see and
submit. No new integration entity is required until per-integration UX
(rotate UI, per-channel dashboards) justifies it — that is the later
"Integration Management" phase, evaluated then.

**Ownership policy for non-user channels:** requests created via an API
key are owned by the integration user for isolation purposes; guests can
never see them (`createdById` mismatch); staff with `manage` triage them
normally. Requester identity lives in the requester fields, not in
permissions.

**AI agents:** may analyze, normalize, classify, and *suggest* (as
`intake_activity` entries of type `ai.*`, attributed to the agent's user).
In the default workflow AI never approves, rejects, delivers, confirms, or
creates tasks — those actions require a human manage-holder. Enforced in
the service layer (actor must satisfy `intakeRequest: ["manage"]` and be a
human session/API-key, not an agent-flagged actor), not just by convention.

**Project access & audit:** unchanged mechanics for all channels —
`assertProjectAccess` bounds every submission; every channel writes the
same `intake_activity` trail with its actor.

## 14. What is left to the builder

- Exact drizzle migration SQL review (generated, then inspected).
- Task-number generation reuse for request `number`.
- Component placement/naming inside `apps/web` following existing
  project-page tab patterns.
- i18n key names; test file placement per existing conventions.
