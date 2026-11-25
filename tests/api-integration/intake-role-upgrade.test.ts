import { beforeEach, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { seedDefaultWorkspaceRoles } from "../../apps/api/src/utils/seed-default-workspace-roles";
import { defaultRolePayloads } from "../../packages/permissions/src";
import { resetTestDatabase } from "./helpers/database";

const origin = "http://localhost:5173";
const { app } = createApp();

beforeEach(() => resetTestDatabase());

async function signup(email: string) {
  const result = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: origin },
    body: JSON.stringify({
      name: "Role upgrade",
      email,
      password: "long-password-for-tests",
    }),
  });
  expect(result.status).toBe(200);
  const body = await result.json();
  const cookie = result.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return { id: body.user.id as string, cookie };
}

// Role rows restored from an instance that predates intake: every permission
// except `intakeRequest`.
async function seedPreIntakeWorkspace() {
  const [workspace] = await db
    .insert(schema.workspaceTable)
    .values({
      id: "pre-intake-workspace",
      name: "Old workspace",
      slug: "old",
      createdAt: new Date(),
    })
    .returning();
  const stale = (payload: Record<string, string[]>) => {
    const { intakeRequest: _drop, ...rest } = payload;
    return JSON.stringify(rest);
  };
  await db.insert(schema.workspaceRoleTable).values(
    (["member", "guest"] as const).map((role) => ({
      workspaceId: workspace.id,
      role,
      permission: stale(defaultRolePayloads[role]),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
  return workspace;
}

async function capabilitiesOf(workspaceId: string, cookie: string) {
  const response = await app.request(
    `/api/workspace/${workspaceId}/capabilities`,
    {
      headers: { Origin: origin, Cookie: cookie },
    },
  );
  expect(response.status).toBe(200);
  return response.json();
}

it("startup restores intake permissions on role rows that predate intake", async () => {
  const owner = await signup("owner@example.com");
  const staff = await signup("staff@example.com");
  const guest = await signup("guest@example.com");
  const workspace = await seedPreIntakeWorkspace();
  await db.insert(schema.workspaceUserTable).values([
    {
      workspaceId: workspace.id,
      userId: owner.id,
      role: "owner",
      joinedAt: new Date(),
    },
    {
      workspaceId: workspace.id,
      userId: staff.id,
      role: "member",
      joinedAt: new Date(),
    },
    {
      workspaceId: workspace.id,
      userId: guest.id,
      role: "guest",
      joinedAt: new Date(),
    },
  ]);

  expect(await capabilitiesOf(workspace.id, staff.cookie)).toMatchObject({
    readIntake: false,
    manageIntake: false,
  });

  await seedDefaultWorkspaceRoles();

  expect(await capabilitiesOf(workspace.id, staff.cookie)).toMatchObject({
    readIntake: true,
    manageIntake: true,
  });
  expect(await capabilitiesOf(workspace.id, guest.cookie)).toMatchObject({
    readIntake: true,
    createIntakeRequests: true,
    manageIntake: false,
  });
});
