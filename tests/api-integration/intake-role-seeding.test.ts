import { eq } from "drizzle-orm";
import { memberAc } from "better-auth/plugins/organization/access";
import { beforeEach, expect, it } from "vite-plus/test";
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
  expect(await isAssignableWorkspaceRole(db, workspace.id, "guest")).toBe(true);
});

it("creates projects with intake disabled and a zeroed request counter", async () => {
  const workspace = await createOwnerWithWorkspace(
    "intake-project@example.com",
  );
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
