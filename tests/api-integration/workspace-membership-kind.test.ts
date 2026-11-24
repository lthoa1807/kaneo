import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { defaultRolePayloads } from "../../packages/permissions/src";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const { app } = createApp();

beforeEach(resetTestDatabase);

async function seedRole(
  workspaceId: string,
  role: string,
  payload: Record<string, string[]>,
) {
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId,
    role,
    permission: JSON.stringify(payload),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function getMembership(workspaceId: string) {
  return app.request(`/api/workspace/${workspaceId}/membership`);
}

function getCapabilities(workspaceId: string) {
  return app.request(`/api/workspace/${workspaceId}/capabilities`);
}

it("answers guest for a guest member with no task permissions", async () => {
  const guest = await createWorkspaceMember({ role: "guest" });
  mockAuthenticatedSession(guest.user);

  const response = await getMembership(guest.workspace.id);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ kind: "guest", role: "guest" });
});

it("answers staff for a custom role that has intake but no task permissions", async () => {
  const staff = await createWorkspaceMember({ role: "intake-only" });
  mockAuthenticatedSession(staff.user);

  const response = await getMembership(staff.workspace.id);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    kind: "staff",
    role: "intake-only",
  });
});

it("answers staff for the owner and for an instance admin without a membership", async () => {
  const owner = await createWorkspaceMember({ role: "owner" });
  mockAuthenticatedSession(owner.user);
  expect(await (await getMembership(owner.workspace.id)).json()).toEqual({
    kind: "staff",
    role: "owner",
  });

  const outsider = await createWorkspaceMember({ role: "member" });
  await db
    .update(schema.userTable)
    .set({ role: "admin" })
    .where(eq(schema.userTable.id, outsider.user.id));
  mockAuthenticatedSession({ ...outsider.user, role: "admin" });
  expect(await (await getMembership(owner.workspace.id)).json()).toEqual({
    kind: "staff",
    role: null,
  });
});

it("never answers guests with a 403 (they hold no workspace:read)", async () => {
  const guest = await createWorkspaceMember({ role: "guest" });
  mockAuthenticatedSession(guest.user);

  const response = await getMembership(guest.workspace.id);
  expect(response.status).not.toBe(403);
});

describe("guest capabilities", () => {
  it("lets a guest read and create intake without any task or project permission", async () => {
    const guest = await createWorkspaceMember({ role: "guest" });
    await seedRole(guest.workspace.id, "guest", defaultRolePayloads.guest);
    mockAuthenticatedSession(guest.user);

    const response = await getCapabilities(guest.workspace.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      readIntake: true,
      createIntakeRequests: true,
      updateIntake: true,
      manageIntake: false,
      manageProjects: false,
    });
  });
});
