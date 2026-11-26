# Intake Portal Phase 1 — Migration + Permissions Implementation Plan

> **Status:** shipped in PR #5. Every step below was executed; the boxes were left
> unticked rather than retro-edited, so treat `main` as the source of truth. Phase 3.1,
> 3.2 and 4 plans carry their own ticks.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the intake data model (`intake_request`, `intake_activity`, `task.intakeRequestId`, `project.intakeEnabled`, `project.lastIntakeRequestNumber`) and the `intakeRequest` permission vocabulary with a seeded `guest` default role — no routes, no UI.

**Architecture:** Pure foundation. `@kaneo/permissions` gains the vocabulary and roles; `apps/api` gains tables via a generated Drizzle migration with an appended add-only role merge. Existing behavior is untouched: `intakeEnabled` defaults `false`, the seeder still only inserts missing rows.

**Tech Stack:** Drizzle ORM + PostgreSQL, better-auth access control (`@kaneo/permissions`), Vitest (`vite-plus/test`), `tests/api-integration` harness.

**Spec:** `docs/superpowers/specs/2026-11-24-intake-portal-design.md` (sections 3.1, 4, 6; MVP items 1–2 in section 12)

## Global Constraints

- Role name is `guest` (lowercase), UI/i18n copy is "Guest" — never "customer" (spec header).
- Role merge is **add-only**: existing permission actions in `workspace_role.permission` are preserved byte-for-byte; only the `intakeRequest` key is added, and only to rows named exactly `viewer`, `member`, `admin` (spec §3.1).
- `owner` is a static better-auth role (no DB row) — it changes only in the compiled definition (spec comment in `packages/permissions/src/index.ts:55-59`).
- Phase 1 adds **no routes, no UI, no notification changes** (spec §12 phases 2–3).
- Every commit passes `pnpm exec vp check`; each task also runs its package's typecheck/tests.
- Branch: `feature/intake-portal`; conventional commits (`feat:`, `test:`).

## Review Focus

1. **Admin-customized role rows keep their customizations after the merge** — an admin who added `{"label": ["read","share"]}` to their `member` row must still have it. The merge uses jsonb `||` (key-add only) and runs once; there is no automated test for the legacy-row path (a fresh test DB cannot produce a pre-migration row). Owner of Task 2 pins it by inspecting the generated SQL against the exact statements in this plan.
2. **Existing projects keep intake off** — every pre-existing and new project row must read `intakeEnabled === false`; only Phase 2+ code may flip it. Pinned by Task 3's project test.
3. **Guests must not gain any `project:*`/`task:*`/org-management surface** — the guest payload is exactly `memberAc.statements` plus `intakeRequest: ["create","read","update"]`. Pinned by Task 1's payload-equality test (`toEqual`, not partial match).
4. **The boot seeder must stay insert-only** — no row that exists gets rewritten on startup (an admin who later removes `intakeRequest` must not have it re-added). Pinned by Task 1's test asserting `seedDefaultWorkspaceRoles` is untouched? No — pinned by inspection: Task 2 does not modify `seed-default-workspace-roles.ts`; if the diff touches it, reject the task.

---

### Task 1: `intakeRequest` vocabulary + `guest` default role in `@kaneo/permissions`

**Files:**
- Modify: `packages/permissions/src/index.ts`
- Test: `packages/permissions/src/index.test.ts`

**Interfaces:**
- Consumes: existing exports of `packages/permissions/src/index.ts` (`statement`, `ac`, `viewer`, `member`, `admin`, `owner`, `builtInRoles`, `DEFAULT_ROLE_NAMES`, `defaultRolePayloads`, `toMutablePayload`).
- Produces (used by Tasks 2–3 and all later phases):
  - `statement.intakeRequest === ["create", "read", "update", "manage"]`
  - `export const guest` (an `ac.newRole` result, same type as `viewer`/`member`), also in `builtInRoles`
  - `DEFAULT_ROLE_NAMES === ["viewer", "member", "admin", "guest"]`
  - `defaultRolePayloads.guest` — JSON payload mirroring `guest.statements`
  - `viewer.statements.intakeRequest === ["read"]`;
    `member`/`admin`/`owner` `.statements.intakeRequest === ["create", "read", "update", "manage"]`

- [ ] **Step 1: Write the failing tests**

Append to `packages/permissions/src/index.test.ts` (mirroring the existing describe style):

```ts
describe("intake permission vocabulary", () => {
  it("adds intakeRequest to the statement surface", () => {
    expect(statement.intakeRequest).toEqual([
      "create",
      "read",
      "update",
      "manage",
    ]);
  });

  it("gives staff roles the manage set and viewer read-only", () => {
    expect(viewer.statements.intakeRequest).toEqual(["read"]);
    expect(member.statements.intakeRequest).toEqual([
      "create",
      "read",
      "update",
      "manage",
    ]);
    expect(admin.statements.intakeRequest).toEqual([
      "create",
      "read",
      "update",
      "manage",
    ]);
    expect(owner.statements.intakeRequest).toEqual([
      "create",
      "read",
      "update",
      "manage",
    ]);
  });

  it("seeds a guest role with no internal surface", () => {
    expect(guest.statements).toEqual({
      ...memberAc.statements,
      intakeRequest: ["create", "read", "update"],
    });
    expect(builtInRoles.guest).toBe(guest);
    expect(DEFAULT_ROLE_NAMES).toContain("guest");
    expect(defaultRolePayloads.guest.intakeRequest).toEqual([
      "create",
      "read",
      "update",
    ]);
    expect(defaultRolePayloads.guest.project).toEqual([]);
    expect(defaultRolePayloads.guest.task).toEqual([]);
  });
});
```

Add `guest` and `memberAc` to the existing import block: `guest` from `"./index"`, `memberAc` from `"better-auth/plugins/organization/access"`.

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @kaneo/permissions test`
Expected: FAIL — `statement.intakeRequest` undefined / `guest` not exported.

- [ ] **Step 3: Implement in `packages/permissions/src/index.ts`**

Five edits, no new helpers:

1. `statement`: add `intakeRequest: ["create", "read", "update", "manage"],` after the `workspace` line.
2. `viewer` role: add `intakeRequest: ["read"],`
3. `member`, `admin`, `owner` roles: each add `intakeRequest: ["create", "read", "update", "manage"],`
4. After `owner`, add (spec §4 verbatim):

```ts
export const guest = ac.newRole({
  ...memberAc.statements,
  intakeRequest: ["create", "read", "update"],
});
```

5. `builtInRoles` → `{ viewer, member, admin, owner, guest } as const`; `DEFAULT_ROLE_NAMES` → `["viewer", "member", "admin", "guest"] as const`; `defaultRolePayloads` gains `guest: toMutablePayload(guest.statements),`.

`memberAc` is already imported in this file. No other file changes — consumers of `DEFAULT_ROLE_NAMES` (`is-assignable-workspace-role.ts`, `auth.ts:599`, `seed-default-workspace-roles.ts`, web role pickers) pick up `guest` automatically by design.

- [ ] **Step 4: Run tests, verify green**

Run: `pnpm --filter @kaneo/permissions test && pnpm --filter @kaneo/permissions build && pnpm --filter @kaneo/api typecheck`
Expected: PASS; the `@kaneo/api` typecheck proves the widened `BuiltInRoleName` type breaks no consumer. (Avoid root `pnpm typecheck` — it drags in the full `apps/web` suite and can exhaust memory in this environment.)

- [ ] **Step 5: Commit**

```bash
git add packages/permissions
git commit -m "feat: add intakeRequest vocabulary and guest default role"
```

---

### Task 2: Intake schema + migration with add-only role merge

**Files:**
- Modify: `apps/api/src/database/schema.ts`
- Create: `apps/api/drizzle/0076_<generated-name>.sql` (via `db:generate`, then edited — see Step 3)

**Interfaces:**
- Consumes: Task 1's `@kaneo/permissions` (not imported here, but the migration's role merge must match Task 1's action sets).
- Produces (schema exports Phase 2 routes import from `../database`):
  - `intakeRequestTable`, `intakeActivityTable` (spec §6, copied verbatim from the spec's TS block)
  - `taskTable.intakeRequestId` — nullable FK, `onDelete: "set null"`, indexed
  - `projectTable.intakeEnabled` — `boolean("intake_enabled").notNull().default(false)`
  - `projectTable.lastIntakeRequestNumber` — `integer("last_intake_request_number").notNull().default(0)`

- [ ] **Step 1: Edit `apps/api/src/database/schema.ts`**

Three placements:

1. `projectTable`: add the two columns directly after `lastTaskNumber` (line ~522). Nothing else.
2. `taskTable`: add after `columnId` (line ~710):
   ```ts
   intakeRequestId: text("intake_request_id").references(
     () => intakeRequestTable.id,
     { onDelete: "set null", onUpdate: "cascade" },
   ),
   ```
   and `index("task_intakeRequestId_idx").on(table.intakeRequestId),` in its index array. (Lazy forward reference is house style — `taskTable` already references `columnTable` defined later, line 601.)
3. Immediately after `taskTable`'s closing, paste the two table definitions from spec §6 (`intakeRequestTable`, `intakeActivityTable`) verbatim. Verify the needed imports already exist in the file (`createId`, `sql`, `jsonb`, `unique` are used today).

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @kaneo/api db:generate`
Expected: a new `apps/api/drizzle/0076_*.sql` + `meta/0076_snapshot.json` + journal entry.

- [ ] **Step 3: Inspect the generated SQL, then append the role merge**

The generated SQL must contain exactly:
- `CREATE TABLE "intake_request"` with FKs: `project_id` → CASCADE, `created_by_id` → RESTRICT; unique `(project_id, number)`; indexes on `(created_by_id)` and `(project_id, status)`; **no `workspace_id` column**.
- `CREATE TABLE "intake_activity"` with FK `intake_request_id` → CASCADE and one index on it.
- `ALTER TABLE "task" ADD COLUMN "intake_request_id" text` + its index + FK with `ON DELETE SET NULL`.
- `ALTER TABLE "project" ADD COLUMN "intake_enabled" boolean DEFAULT false NOT NULL` and `ADD COLUMN "last_intake_request_number" integer DEFAULT 0 NOT NULL`.

Then append to the same file (this is the one-time data migration from spec §3.1 — stored role rows replace compiled definitions and the boot seeder never updates existing rows, so existing workspaces need the merge; jsonb `||` adds only the missing key, the `IS NULL` guard makes it idempotent, and the `WHERE role IN (...)` clause leaves custom-named roles untouched):

```sql
-- Add-only merge: grant intakeRequest actions to the seeded default roles.
-- `workspace_role` rows fully replace compiled definitions and the boot
-- seeder only inserts missing rows, so existing workspaces would otherwise
-- have no intake permissions at all.
UPDATE "workspace_role"
SET "permission" = ("permission"::jsonb || '{"intakeRequest":["read"]}'::jsonb)::text
WHERE "role" = 'viewer' AND ("permission"::jsonb -> 'intakeRequest') IS NULL;

UPDATE "workspace_role"
SET "permission" = ("permission"::jsonb || '{"intakeRequest":["create","read","update","manage"]}'::jsonb)::text
WHERE "role" IN ('member', 'admin') AND ("permission"::jsonb -> 'intakeRequest') IS NULL;
```

`owner` needs no SQL — it is a static role with no DB row (Task 1 already updated its compiled definition).

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter @kaneo/api typecheck && pnpm exec vp check`
Expected: PASS. (Migration application is proven by Task 3, whose harness runs `migrate()` on a fresh DB — see `tests/api-integration/helpers/database.ts`.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database/schema.ts apps/api/drizzle
git commit -m "feat: add intake_request and intake_activity tables with intake project flags"
```

---

### Task 3: Integration tests — seeding, guest payload, defaults

**Files:**
- Test: `tests/api-integration/intake-role-seeding.test.ts` (create)

**Interfaces:**
- Consumes: `createApp` from `apps/api/src/index`; `db, { schema }` from `apps/api/src/database`; `resetTestDatabase` from `./helpers/database`; `isAssignableWorkspaceRole` from `apps/api/src/admin/is-assignable-workspace-role`; `memberAc` from `better-auth/plugins/organization/access`. Workspace creation must go through the better-auth endpoint (below) so the `auth.ts` seeding hook runs — raw `createWorkspaceMember` inserts bypass it.
- Produces: proof that migrations + seeding + Task 1 payloads land together. Phase 2 builds on the state these tests pin.

- [ ] **Step 1: Write the test file**

Pattern copied from `tests/api-integration/billing-delete-guard.test.ts:110-140` (signup → cookie → `organization/create`). One file, three tests:

```ts
import { beforeEach, expect, it } from "vite-plus/test";
import { memberAc } from "better-auth/plugins/organization/access";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { isAssignableWorkspaceRole } from "../../apps/api/src/admin/is-assignable-workspace-role";
import { resetTestDatabase } from "./helpers/database";

const origin = "http://localhost:5173";
const { app } = createApp();
beforeEach(() => resetTestDatabase());

async function createOwnerWithWorkspace(email: string) {
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: origin },
    body: JSON.stringify({
      email,
      password: "long-password-for-tests",
      name: "Intake Role Test",
    }),
  });
  expect(signUp.status).toBe(200);
  const cookie = signUp.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  const created = await app.request("/api/auth/organization/create", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Intake Space", slug: email.split("@")[0] }),
  });
  expect(created.status).toBe(200);
  return (await created.json()) as { id: string };
}

it("seeds a guest role row with intake-only permissions", async () => {
  const workspace = await createOwnerWithWorkspace("intake-owner@example.com");
  const rows = await db
    .select()
    .from(schema.workspaceRoleTable)
    .where(eq(schema.workspaceRoleTable.workspaceId, workspace.id));
  const byRole = new Map(rows.map((r) => [r.role, JSON.parse(r.permission)]));

  expect(byRole.get("guest")).toEqual({
    ...memberAc.statements,
    intakeRequest: ["create", "read", "update"],
  });
  expect(byRole.get("member")!.intakeRequest).toEqual([
    "create",
    "read",
    "update",
    "manage",
  ]);
  expect(byRole.get("viewer")!.intakeRequest).toEqual(["read"]);
});

it("treats guest as an assignable workspace role", async () => {
  const workspace = await createOwnerWithWorkspace("intake-assign@example.com");
  expect(await isAssignableWorkspaceRole(db, workspace.id, "guest")).toBe(
    true,
  );
});

it("creates projects with intake disabled and a zeroed request counter", async () => {
  const workspace = await createOwnerWithWorkspace("intake-project@example.com");
  const [project] = await db
    .insert(schema.projectTable)
    .values({
      workspaceId: workspace.id,
      name: "Intake Target",
      slug: "intake-target",
    })
    .returning();
  expect(project.intakeEnabled).toBe(false);
  expect(project.lastIntakeRequestNumber).toBe(0);
});
```

Add `eq` to the drizzle-orm import.

- [ ] **Step 2: Run the suite, verify green (this also applies the migration)**

Run: `pnpm test:integration` (filtered to this file if the runner supports a path arg; requires `DATABASE_URL` per `tests/api-integration/README.md`).
Expected: PASS on all three. The `resetTestDatabase` harness runs the real `migrate()` over `apps/api/drizzle`, so Task 2's migration — including the appended role merge — is exercised here.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @kaneo/api typecheck && pnpm exec vp check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/api-integration/intake-role-seeding.test.ts
git commit -m "test: cover intake role seeding and project intake defaults"
```

---

## Deliberately out of scope (Phase 2+)

Routes, ownership enforcement, transition map, ws/polling, UI, notifications, OpenAPI — spec §12 items 3–10. No stub code for them here.
