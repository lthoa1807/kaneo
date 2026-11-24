import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const { app } = createApp();

beforeEach(resetTestDatabase);

async function joinWorkspace(workspaceId: string, role: string) {
  const member = await createWorkspaceMember({ role });
  await db
    .update(schema.workspaceUserTable)
    .set({ workspaceId })
    .where(eq(schema.workspaceUserTable.userId, member.user.id));
  return member;
}

async function workspaceWithProject() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    name: "Portal",
    slug: "portal",
  });
  const guest = await joinWorkspace(owner.workspace.id, "guest");
  const member = await joinWorkspace(owner.workspace.id, "member");
  return { owner, project, todo: columns.todo, guest, member };
}

async function createTask(projectId: string, status: string) {
  const response = await app.request(`/api/task/${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        title: "Ticket",
        description: "",
        priority: "low",
        status,
      }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { id: string };
}

describe("guest assignees", () => {
  it("refuses to assign a task to a guest", async () => {
    const ctx = await workspaceWithProject();
    mockAuthenticatedSession(ctx.owner.user);
    const task = await createTask(ctx.project.id, ctx.todo.slug);

    const response = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: ctx.guest.user.id }),
    });

    expect(response.status).toBe(403);
  });

  it("refuses to create a task assigned to a guest", async () => {
    const ctx = await workspaceWithProject();
    mockAuthenticatedSession(ctx.owner.user);

    const response = await app.request(`/api/task/${ctx.project.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Ticket",
        description: "",
        priority: "low",
        status: ctx.todo.slug,
        userId: ctx.guest.user.id,
      }),
    });

    expect(response.status).toBe(403);
  });

  it("keeps a regular member assignable", async () => {
    const ctx = await workspaceWithProject();
    mockAuthenticatedSession(ctx.owner.user);
    const task = await createTask(ctx.project.id, ctx.todo.slug);

    const response = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: ctx.member.user.id }),
    });

    expect(response.status).toBe(200);
  });
});
