import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { persistNotification } from "../../apps/api/src/notification/controllers/create-notification";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

beforeEach(resetTestDatabase);

let sequence = 0;

async function intakeRequestFor(projectId: string, createdById: string) {
  sequence += 1;
  const [row] = await db
    .insert(schema.intakeRequestTable)
    .values({ projectId, createdById, title: "Fix login", number: sequence })
    .returning();
  if (!row) throw new Error("intake request insert failed");
  return row;
}

function notify(userId: string, requestId: string) {
  return persistNotification({
    userId,
    type: "intake_request_status_changed",
    resourceId: requestId,
    resourceType: "intake_request",
    eventData: { requestTitle: "Fix login", newStatus: "delivered" },
  });
}

describe("intake notifications", () => {
  it("reaches the guest who owns the request", async () => {
    const guest = await createWorkspaceMember({ role: "guest" });
    const { project } = await createProjectFixture({
      workspaceId: guest.workspace.id,
    });
    await restrictToProjects(guest.workspace.id, guest.user.id, [project.id]);
    const request = await intakeRequestFor(project.id, guest.user.id);

    const notification = await notify(guest.user.id, request.id);

    expect(notification).not.toBeNull();
    expect(notification?.resourceType).toBe("intake_request");
  });

  it("stays away from another guest in the same project", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    const first = await createWorkspaceMember({ role: "guest" });
    const second = await createWorkspaceMember({ role: "guest" });
    for (const guest of [first, second]) {
      await db.insert(schema.workspaceUserTable).values({
        workspaceId: owner.workspace.id,
        userId: guest.user.id,
        role: "guest",
        joinedAt: new Date(),
      });
      await restrictToProjects(owner.workspace.id, guest.user.id, [project.id]);
    }
    const request = await intakeRequestFor(project.id, first.user.id);

    const notification = await notify(second.user.id, request.id);
    expect(notification).toBeNull();
  });

  it("stays away from staff without access to the project", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    const { project: otherProject } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    const outsider = await createWorkspaceMember({ role: "member" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: outsider.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    await restrictToProjects(owner.workspace.id, outsider.user.id, [
      otherProject.id,
    ]);
    const request = await intakeRequestFor(project.id, owner.user.id);

    const notification = await notify(outsider.user.id, request.id);
    expect(notification).toBeNull();
  });

  it("appears in the guest's inbox for that workspace", async () => {
    const guest = await createWorkspaceMember({ role: "guest" });
    const { project } = await createProjectFixture({
      workspaceId: guest.workspace.id,
    });
    await restrictToProjects(guest.workspace.id, guest.user.id, [project.id]);
    const request = await intakeRequestFor(project.id, guest.user.id);
    await notify(guest.user.id, request.id);
    mockAuthenticatedSession(guest.user);

    const response = await createApp().app.request(
      `/api/notification?workspaceId=${guest.workspace.id}`,
    );

    expect(response.status).toBe(200);
    const rows = (await response.json()) as Array<{
      resourceType: string | null;
      resourceId: string | null;
    }>;
    expect(rows.map((row) => row.resourceId)).toContain(request.id);
    expect(rows.every((row) => row.resourceType === "intake_request")).toBe(
      true,
    );
  });
});
