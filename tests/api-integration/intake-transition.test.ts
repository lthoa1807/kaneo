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

type Actor = "manage" | "guest";

async function seedTransition(from: string, actor: Actor) {
  const owner = await createWorkspaceMember({ role: "guest" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
  });
  const request = await createIntakeRequestRow(project.id, owner.user.id);
  await db
    .update(schema.intakeRequestTable)
    .set({ status: from as never })
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
    return { owner, project, request };
  }

  mockAuthenticatedSession(owner.user);
  return { owner, project, request };
}

function transition(requestId: string, body: Record<string, unknown>) {
  return createApp().app.request(
    `/api/intake/requests/${requestId}/transition`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function activities(intakeRequestId: string) {
  return db
    .select()
    .from(schema.intakeActivityTable)
    .where(eq(schema.intakeActivityTable.intakeRequestId, intakeRequestId));
}

describe("intake request transitions", () => {
  const legal: Array<[string, string, Actor]> = [
    ["new", "triaged", "manage"],
    ["new", "approved", "manage"],
    ["triaged", "rejected", "manage"],
    ["triaged", "approved", "manage"],
    ["approved", "in_progress", "manage"],
    ["in_progress", "delivered", "manage"],
    ["delivered", "needs_revision", "guest"],
    ["delivered", "confirmed", "guest"],
    ["needs_revision", "in_progress", "manage"],
  ];

  it.each(legal)("allows %s → %s by %s", async (from, to, actor) => {
    const { request } = await seedTransition(from, actor);

    const response = await transition(request.id, { to, note: "moving on" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe(to);

    const [row] = await db
      .select()
      .from(schema.intakeRequestTable)
      .where(eq(schema.intakeRequestTable.id, request.id));
    expect(row?.status).toBe(to);

    const rows = await activities(request.id);
    expect(
      rows.some(
        (activity) =>
          activity.type === "status_changed" &&
          (activity.eventData as { from: string; to: string }).from === from &&
          (activity.eventData as { from: string; to: string }).to === to,
      ),
    ).toBe(true);
  });

  const illegal: Array<[string, string, Actor]> = [
    ["new", "delivered", "manage"],
    ["delivered", "confirmed", "manage"],
    ["delivered", "needs_revision", "manage"],
    ["new", "triaged", "guest"],
    ["confirmed", "in_progress", "manage"],
    ["rejected", "approved", "manage"],
  ];

  it.each(illegal)(
    "rejects %s → %s by %s with 409 REQUEST_STATUS_TRANSITION",
    async (from, to, actor) => {
      const { request } = await seedTransition(from, actor);

      const response = await transition(request.id, { to });
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.code).toBe("REQUEST_STATUS_TRANSITION");
      expect(body.status).toBe(from);
    },
  );

  it("requires a note to reject and to request revision", async () => {
    const rejected = await seedTransition("triaged", "manage");
    const rejectResponse = await transition(rejected.request.id, {
      to: "rejected",
    });
    expect(rejectResponse.status).toBe(400);
    const [rejectRow] = await db
      .select()
      .from(schema.intakeRequestTable)
      .where(eq(schema.intakeRequestTable.id, rejected.request.id));
    expect(rejectRow?.status).toBe("triaged");

    const revised = await seedTransition("delivered", "guest");
    const revisionResponse = await transition(revised.request.id, {
      to: "needs_revision",
    });
    expect(revisionResponse.status).toBe(400);
    const [revisionRow] = await db
      .select()
      .from(schema.intakeRequestTable)
      .where(eq(schema.intakeRequestTable.id, revised.request.id));
    expect(revisionRow?.status).toBe("delivered");
  });

  it("sets confirmedAt and confirmedVia on confirm, writes a confirmed activity row", async () => {
    const { request } = await seedTransition("delivered", "guest");

    const response = await transition(request.id, { to: "confirmed" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.confirmedAt).not.toBeNull();
    expect(body.confirmedVia).toBe("guest_portal");

    const rows = await activities(request.id);
    expect(rows.some((activity) => activity.type === "confirmed")).toBe(true);
  });

  it("blocks submission into disabled intake but not lifecycle of existing requests", async () => {
    const { project, request } = await seedTransition("new", "manage");
    await db
      .update(schema.projectTable)
      .set({ intakeEnabled: false })
      .where(eq(schema.projectTable.id, project.id));

    const response = await transition(request.id, { to: "triaged" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("triaged");
  });
});

describe("intake request activity", () => {
  async function seedTrail() {
    const { owner, request } = await seedTransition("new", "manage");
    await db.insert(schema.intakeActivityTable).values([
      {
        intakeRequestId: request.id,
        type: "created",
        userId: owner.user.id,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        intakeRequestId: request.id,
        type: "status_changed",
        content: "ok",
        eventData: { from: "new", to: "triaged" },
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
      {
        intakeRequestId: request.id,
        type: "task_linked",
        eventData: { taskId: "t1" },
        createdAt: new Date("2026-01-03T00:00:00Z"),
      },
    ]);
    return { owner, request };
  }

  function listActivity(requestId: string) {
    return createApp().app.request(
      `/api/intake/requests/${requestId}/activity`,
    );
  }

  it("returns the full trail newest-first for manage actors", async () => {
    const { request } = await seedTrail();

    const response = await listActivity(request.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((item: { type: string }) => item.type)).toEqual([
      "task_linked",
      "status_changed",
      "created",
    ]);
    expect(body.items[1].content).toBe("ok");
    expect(body.items[1].eventData).toEqual({ from: "new", to: "triaged" });
  });

  it("hides task-linked and internal entries from the guest owner", async () => {
    const { owner, request } = await seedTrail();
    mockAuthenticatedSession(owner.user);

    const response = await listActivity(request.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((item: { type: string }) => item.type)).toEqual([
      "status_changed",
      "created",
    ]);
  });

  it("404s a non-owner guest", async () => {
    const { request } = await seedTrail();
    const outsider = await createWorkspaceMember({ role: "guest" });
    mockAuthenticatedSession(outsider.user);

    const response = await listActivity(request.id);
    expect(response.status).toBe(404);
  });
});
