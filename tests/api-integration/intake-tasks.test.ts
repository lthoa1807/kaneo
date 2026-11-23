import { beforeEach, describe, expect, it } from "vite-plus/test";
import { and, eq } from "drizzle-orm";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

const numberByProject = new Map<string, number>();

async function createIntakeRequestRow(projectId: string, createdById: string) {
  const number = (numberByProject.get(projectId) ?? 0) + 1;
  numberByProject.set(projectId, number);
  const [row] = await db
    .insert(schema.intakeRequestTable)
    .values({ projectId, createdById, title: "Request", number })
    .returning();
  if (!row) throw new Error("intake request insert failed");
  return row;
}

async function seedRequest(status: string, actor: "manage" | "guest") {
  const owner = await createWorkspaceMember({ role: "guest" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
  });
  const request = await createIntakeRequestRow(project.id, owner.user.id);
  await db
    .update(schema.intakeRequestTable)
    .set({ status: status as never })
    .where(eq(schema.intakeRequestTable.id, request.id));

  if (actor === "manage") {
    const manager = await createWorkspaceMember({
      workspaceName: "other workspace",
    });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: manager.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(manager.user);
  } else {
    mockAuthenticatedSession(owner.user);
  }
  return { owner, project, request };
}

function attach(requestId: string) {
  return createApp().app.request(`/api/intake/requests/${requestId}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Do it",
      description: "",
      status: "to-do",
      priority: "no-priority",
    }),
  });
}

describe("intake task attachment", () => {
  it.each(["approved", "in_progress", "needs_revision"])(
    "attaches while %s",
    async (status) => {
      const { request } = await seedRequest(status, "manage");

      const response = await attach(request.id);
      expect(response.status).toBe(200);
      const body = await response.json();

      const [task] = await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.intakeRequestId, request.id));
      expect(task?.id).toBe(body.id);

      const [activity] = await db
        .select()
        .from(schema.intakeActivityTable)
        .where(
          and(
            eq(schema.intakeActivityTable.intakeRequestId, request.id),
            eq(schema.intakeActivityTable.type, "task_linked"),
          ),
        );
      expect(activity?.eventData).toEqual({ taskId: body.id });
    },
  );

  it.each(["new", "triaged", "delivered", "confirmed", "rejected"])(
    "rejects attachment while %s (409 REQUEST_NOT_TASK_ATTACHABLE)",
    async (status) => {
      const { request } = await seedRequest(status, "manage");

      const response = await attach(request.id);
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe("REQUEST_NOT_TASK_ATTACHABLE");
    },
  );

  it("rejects guests with 403", async () => {
    const { request } = await seedRequest("approved", "guest");

    const response = await attach(request.id);
    expect(response.status).toBe(403);
  });
});
