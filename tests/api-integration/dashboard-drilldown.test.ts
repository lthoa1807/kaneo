import { randomUUID } from "node:crypto";
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
const utcDay = (date: Date) => date.toISOString().slice(0, 10);
const middayUtc = new Date(`${utcDay(new Date())}T12:00:00.000Z`);

let taskNumber = 0;
let currentWorkspaceId = "";

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

async function bucket(query = "") {
  const response = await projectAccessApi()(
    `/workspace/${currentWorkspaceId}/dashboard/tasks${query}`,
  );
  return {
    status: response.status,
    body:
      response.status === 200
        ? ((await response.json()) as {
            total: number;
            truncated: boolean;
            items: { ticket: string; title: string }[];
          })
        : null,
  };
}

beforeEach(async () => {
  await resetTestDatabase();
  taskNumber = 0;
});

describe("workspace dashboard drilldown", () => {
  it("rejects anonymous callers and guests", async () => {
    mockAnonymousSession();
    currentWorkspaceId = "workspace-anonymous";
    expect((await bucket()).status).toBe(401);

    const guest = await createWorkspaceMember({ role: "guest" });
    mockAuthenticatedSession(guest.user);
    currentWorkspaceId = guest.workspace.id;
    expect((await bucket()).status).toBe(403);
  });

  it("filters by priority and UTC day, and leaves out done tasks", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    currentWorkspaceId = member.workspace.id;

    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
      slug: "FILT",
    });
    await addTask(project.id, columns.todo.id, {
      title: "Urgent today",
      priority: "urgent",
      dueDate: middayUtc,
    });
    await addTask(project.id, columns.todo.id, {
      title: "Low today",
      priority: "low",
      dueDate: middayUtc,
    });
    await addTask(project.id, columns.todo.id, {
      title: "Urgent but done",
      priority: "urgent",
      status: "done",
      dueDate: middayUtc,
    });
    await addTask(project.id, columns.todo.id, {
      title: "Urgent tomorrow",
      priority: "urgent",
      dueDate: new Date(middayUtc.getTime() + day),
    });

    const urgentToday = await bucket(
      `?priority=urgent&day=${utcDay(middayUtc)}`,
    );
    expect(urgentToday.status).toBe(200);
    expect(urgentToday.body?.total).toBe(1);
    expect(urgentToday.body?.items[0]?.title).toBe("Urgent today");
    expect(urgentToday.body?.items[0]?.ticket).toMatch(/^FILT-\d+$/);

    const today = await bucket(`?day=${utcDay(middayUtc)}`);
    expect(today.body?.total).toBe(2);

    const urgent = await bucket(`?priority=urgent&projectId=${project.id}`);
    expect(urgent.body?.total).toBe(2);
  });

  it("rejects an invalid day", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    currentWorkspaceId = member.workspace.id;

    expect((await bucket("?day=not-a-day")).status).toBe(400);
  });
});
