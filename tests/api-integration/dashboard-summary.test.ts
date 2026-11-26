import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { projectAccessApi } from "./helpers/project-access/project-access-api";

const day = 86_400_000;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * day);

type Bucket = {
  total: number;
  truncated: boolean;
  items: { ticket: string }[];
};
type Summary = {
  tasks: Record<
    "mineOverdue" | "overdueUrgent" | "dueSoon" | "unassigned",
    Bucket
  >;
};

async function addTask(
  projectId: string,
  columnId: string,
  overrides: Partial<typeof schema.taskTable.$inferInsert> = {},
) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      id: `task-${randomUUID()}`,
      projectId,
      title: "Task",
      description: "",
      priority: "medium",
      status: "to-do",
      columnId,
      number: ++taskNumber,
      position: 1,
      ...overrides,
    })
    .returning();
  return task;
}

let taskNumber = 0;

beforeEach(resetTestDatabase);

async function summary() {
  const response = await projectAccessApi()(
    `/workspace/${currentWorkspaceId}/dashboard`,
  );
  return {
    status: response.status,
    body: response.status === 200 ? ((await response.json()) as Summary) : null,
  };
}

let currentWorkspaceId = "";

describe("workspace dashboard", () => {
  it("rejects anonymous callers and guests", async () => {
    mockAnonymousSession();
    currentWorkspaceId = "workspace-anonymous";
    expect((await summary()).status).toBe(401);

    const guest = await createWorkspaceMember({ role: "guest" });
    mockAuthenticatedSession(guest.user);
    currentWorkspaceId = guest.workspace.id;
    expect((await summary()).status).toBe(403);
  });

  it("counts only open tasks in live projects, with the project key as ticket", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    currentWorkspaceId = member.workspace.id;

    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "BILL",
    });
    await addTask(project.id, columns.todo.id, {
      title: "Overdue",
      priority: "urgent",
      dueDate: at(-2),
      userId: member.user.id,
    });
    await addTask(project.id, columns.todo.id, {
      title: "Done but overdue",
      status: "done",
      dueDate: at(-2),
      userId: member.user.id,
    });
    await addTask(project.id, columns.todo.id, {
      title: "Unassigned",
      dueDate: at(1),
    });

    const archived = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "OLD",
    });
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, archived.project.id));
    await addTask(archived.project.id, archived.columns.todo.id, {
      title: "Archived project task",
      dueDate: at(-2),
    });

    const { status, body } = await summary();
    expect(status).toBe(200);
    expect(body?.tasks.mineOverdue.total).toBe(1);
    expect(body?.tasks.mineOverdue.items[0]?.ticket).toMatch(/^BILL-\d+$/);
    expect(body?.tasks.overdueUrgent.total).toBe(1);
    expect(body?.tasks.dueSoon.total).toBe(1);
    expect(body?.tasks.unassigned.total).toBe(1);
  });

  it("hides projects the member cannot access", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    currentWorkspaceId = member.workspace.id;

    const granted = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "OPEN",
    });
    const hidden = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "HIDE",
    });

    await db.insert(schema.workspaceMemberAccessTable).values({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      projectAccess: "selected",
    });
    await db.insert(schema.workspaceMemberProjectTable).values({
      workspaceId: member.workspace.id,
      userId: member.user.id,
      projectId: granted.project.id,
    });

    await addTask(granted.project.id, granted.columns.todo.id, {
      title: "Visible",
      priority: "urgent",
      dueDate: at(-1),
    });
    await addTask(hidden.project.id, hidden.columns.todo.id, {
      title: "Hidden",
      priority: "urgent",
      dueDate: at(-1),
    });

    const { status, body } = await summary();
    expect(status).toBe(200);
    expect(body?.tasks.overdueUrgent.total).toBe(1);
    expect(body?.tasks.overdueUrgent.items[0]?.ticket).toMatch(/^OPEN-\d+$/);
  });
});
