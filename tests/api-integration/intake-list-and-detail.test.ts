import { beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

beforeEach(resetTestDatabase);

async function enableIntake(projectId: string) {
  await db
    .update(schema.projectTable)
    .set({ intakeEnabled: true })
    .where(eq(schema.projectTable.id, projectId));
}

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

function listRequests(workspaceId: string, query = "") {
  return createApp().app.request(
    `/api/intake/workspaces/${workspaceId}/intake-requests${query}`,
  );
}

describe("intake request list", () => {
  it("shows a guest only their own requests, with progress counts", async () => {
    const guest = await createWorkspaceMember({ role: "guest" });
    const staff = await createWorkspaceMember({
      workspaceName: "other workspace",
    });
    const { project } = await createProjectFixture({
      workspaceId: guest.workspace.id,
      name: "Alpha",
    });
    await enableIntake(project.id);
    const own = await createIntakeRequestRow(project.id, guest.user.id);
    await createIntakeRequestRow(project.id, staff.user.id);
    await db.insert(schema.taskTable).values([
      {
        projectId: project.id,
        title: "A",
        status: "done",
        number: 1,
        intakeRequestId: own.id,
      },
      {
        projectId: project.id,
        title: "B",
        status: "to-do",
        number: 2,
        intakeRequestId: own.id,
      },
    ]);
    mockAuthenticatedSession(guest.user);

    const response = await listRequests(guest.workspace.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(own.id);
    expect(body.items[0].taskCount).toBe(2);
    expect(body.items[0].completedTaskCount).toBe(1);
    expect(body.items[0].projectName).toBe("Alpha");
    expect(body.total).toBe(1);
  });

  it("shows manage actors every request in projects they can access", async () => {
    const member = await createWorkspaceMember();
    const guest = await createWorkspaceMember({ role: "guest" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await enableIntake(project.id);
    await createIntakeRequestRow(project.id, guest.user.id);
    await createIntakeRequestRow(project.id, member.user.id);
    mockAuthenticatedSession(member.user);

    const response = await listRequests(member.workspace.id);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("filters by projectId and status and paginates", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await enableIntake(project.id);
    const first = await createIntakeRequestRow(project.id, member.user.id);
    const second = await createIntakeRequestRow(project.id, member.user.id);
    const inOther = await createIntakeRequestRow(
      other.project.id,
      member.user.id,
    );
    await db
      .update(schema.intakeRequestTable)
      .set({ status: "triaged" })
      .where(eq(schema.intakeRequestTable.id, second.id));
    mockAuthenticatedSession(member.user);

    const byStatus = await (
      await listRequests(member.workspace.id, "?status=new")
    ).json();
    expect(byStatus.items.map((item: { id: string }) => item.id)).toEqual([
      inOther.id,
      first.id,
    ]);

    const byProject = await (
      await listRequests(member.workspace.id, `?projectId=${project.id}`)
    ).json();
    expect(byProject.items.map((item: { id: string }) => item.id)).toEqual([
      second.id,
      first.id,
    ]);

    const page2 = await (
      await listRequests(
        member.workspace.id,
        `?projectId=${project.id}&page=2&limit=1`,
      )
    ).json();
    expect(page2.items.map((item: { id: string }) => item.id)).toEqual([
      first.id,
    ]);
    expect(page2.total).toBe(2);
    expect(page2.page).toBe(2);
    expect(page2.totalPages).toBe(2);
  });

  it("hides a guest's own requests in projects they can no longer access", async () => {
    const guest = await createWorkspaceMember({ role: "guest" });
    const alpha = await createProjectFixture({
      workspaceId: guest.workspace.id,
      name: "Alpha",
    });
    const beta = await createProjectFixture({
      workspaceId: guest.workspace.id,
      name: "Beta",
    });
    await createIntakeRequestRow(alpha.project.id, guest.user.id);
    const hidden = await createIntakeRequestRow(beta.project.id, guest.user.id);
    await restrictToProjects(guest.workspace.id, guest.user.id, [
      alpha.project.id,
    ]);
    mockAuthenticatedSession(guest.user);

    const response = await listRequests(guest.workspace.id);
    const body = await response.json();
    expect(
      body.items.some((item: { id: string }) => item.id === hidden.id),
    ).toBe(false);
  });
});

describe("intake request detail", () => {
  async function setupWithTasks() {
    const guest = await createWorkspaceMember({ role: "guest" });
    const { project } = await createProjectFixture({
      workspaceId: guest.workspace.id,
      name: "Alpha",
    });
    await enableIntake(project.id);
    const request = await createIntakeRequestRow(project.id, guest.user.id);
    await db.insert(schema.taskTable).values([
      {
        projectId: project.id,
        title: "A",
        status: "done",
        number: 1,
        intakeRequestId: request.id,
      },
      {
        projectId: project.id,
        title: "B",
        status: "to-do",
        number: 2,
        intakeRequestId: request.id,
      },
    ]);
    return { guest, project, request };
  }

  it("shows manage actors linked tasks and progress", async () => {
    const member = await createWorkspaceMember();
    const { guest, request } = await setupWithTasks();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: guest.workspace.id,
      userId: member.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    mockAuthenticatedSession(member.user);

    const response = await createApp().app.request(
      `/api/intake/requests/${request.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.projectName).toBe("Alpha");
    expect(body.taskCount).toBe(2);
    expect(body.completedTaskCount).toBe(1);
    expect(body.linkedTasks).toEqual([
      { id: expect.any(String), number: 1, title: "A", status: "done" },
      { id: expect.any(String), number: 2, title: "B", status: "to-do" },
    ]);
  });

  it("shows guests progress only, never task internals", async () => {
    const { guest, request } = await setupWithTasks();
    mockAuthenticatedSession(guest.user);

    const response = await createApp().app.request(
      `/api/intake/requests/${request.id}`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.taskCount).toBe(2);
    expect(body.completedTaskCount).toBe(1);
    expect(body.linkedTasks).toBeUndefined();
  });

  it("denies a non-owner guest on every request route with 404", async () => {
    const guestA = await createWorkspaceMember({ role: "guest" });
    const guestB = await createWorkspaceMember({ role: "guest" });
    const { project } = await createProjectFixture({
      workspaceId: guestA.workspace.id,
    });
    const request = await createIntakeRequestRow(project.id, guestA.user.id);
    mockAuthenticatedSession(guestB.user);

    const app = createApp().app;
    const detail = await app.request(`/api/intake/requests/${request.id}`);
    expect(detail.status).toBe(404);

    const patch = await app.request(`/api/intake/requests/${request.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "hijack" }),
    });
    expect(patch.status).toBe(404);

    const transition = await app.request(
      `/api/intake/requests/${request.id}/transition`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: "triaged" }),
      },
    );
    expect(transition.status).toBe(404);

    const activity = await app.request(
      `/api/intake/requests/${request.id}/activity`,
    );
    expect(activity.status).toBe(404);

    const attach = await app.request(
      `/api/intake/requests/${request.id}/tasks`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "t" }),
      },
    );
    expect(attach.status).toBe(404);
  });
});
