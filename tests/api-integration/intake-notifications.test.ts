import * as email from "@kaneo/email";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../apps/api/src/notification";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

vi.mock("@kaneo/email", async (original) => ({
  ...(await original<object>()),
  isSmtpConfigured: () => true,
  sendNotificationEmail: vi.fn(async () => undefined),
}));

vi.mock("../../apps/api/src/events", async (original) => {
  const events = await original<typeof import("../../apps/api/src/events")>();
  return {
    ...events,
    // Subscribers are async; assertions need them finished first.
    publishEvent: (...args: Parameters<typeof events.publishEvent>) =>
      events.publishEvent(args[0], args[1], { waitForHandlers: true }),
  };
});

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});

async function fixture() {
  const guest = await createWorkspaceMember({ role: "guest" });
  const { project } = await createProjectFixture({
    workspaceId: guest.workspace.id,
  });
  await db
    .update(schema.projectTable)
    .set({ intakeEnabled: true })
    .where(eq(schema.projectTable.id, project.id));

  const manager = await createWorkspaceMember({ role: "member" });
  const viewer = await createWorkspaceMember({ role: "viewer" });
  for (const member of [manager, viewer]) {
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: guest.workspace.id,
      userId: member.user.id,
      role: member === manager ? "member" : "viewer",
      joinedAt: new Date(),
    });
  }

  return { guest, project, manager, viewer };
}

function submit(workspaceId: string, projectId: string) {
  return createApp().app.request(
    `/api/intake/workspaces/${workspaceId}/intake-requests`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, title: "Printer is down" }),
    },
  );
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

// Delivery is fire-and-forget after the row is written, so give it a moment.
async function sentMail() {
  const calls = () =>
    vi.mocked(email.sendNotificationEmail).mock.calls as unknown as Array<
      [string, string, { actionUrl?: string }]
    >;
  for (let attempt = 0; attempt < 50 && calls().length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return calls();
}

async function notificationsOf(userId: string) {
  return db
    .select()
    .from(schema.notificationTable)
    .where(eq(schema.notificationTable.userId, userId));
}

async function submitted() {
  const world = await fixture();
  mockAuthenticatedSession(world.guest.user);
  const response = await submit(world.guest.workspace.id, world.project.id);
  expect(response.status).toBe(200);
  const body = await response.json();
  return { ...world, request: body };
}

async function moveAs(
  user: { id: string },
  requestId: string,
  to: string,
  note = "Because",
) {
  mockAuthenticatedSession(user as never);
  const response = await transition(requestId, { to, note });
  expect(response.status).toBe(200);
}

describe("intake notifications", () => {
  it("tells the managers, and only them, that a guest filed a request", async () => {
    const { guest, project, manager, viewer, request } = await submitted();

    const managerRows = await notificationsOf(manager.user.id);
    expect(managerRows).toHaveLength(1);
    expect(managerRows[0]).toMatchObject({
      type: "intake_request_created",
      resourceType: "intake_request",
      resourceId: request.id,
    });
    expect(await notificationsOf(viewer.user.id)).toEqual([]);
    expect(await notificationsOf(guest.user.id)).toEqual([]);
    expect(project.id).toBe(request.projectId);
  });

  it("tells the guest when a manager rejects, and not the manager", async () => {
    const { guest, manager, request } = await submitted();

    await moveAs(manager.user, request.id, "rejected");

    const guestRows = await notificationsOf(guest.user.id);
    expect(guestRows).toHaveLength(1);
    expect(guestRows[0]).toMatchObject({
      type: "intake_request_status_changed",
      resourceType: "intake_request",
      eventData: { status: "rejected", requestNumber: request.number },
    });
    expect(await notificationsOf(manager.user.id)).toHaveLength(1);
  });

  it("mails the guest without needing a preference row", async () => {
    const { guest, manager, request } = await submitted();

    await moveAs(manager.user, request.id, "rejected");

    expect(guest.user.email).toBeTruthy();
    const calls = await sentMail();
    expect(calls).toHaveLength(1);
    const [recipient, title, options] = calls[0];
    expect(recipient).toBe(guest.user.email);
    expect(title).toBe("Request status changed");
    expect(options.actionUrl).toContain(`/intake/${request.id}`);
  });

  it("tells the guest when a request is delivered", async () => {
    const { guest, manager, request } = await submitted();

    await moveAs(manager.user, request.id, "approved");
    await moveAs(manager.user, request.id, "in_progress");
    await moveAs(manager.user, request.id, "delivered");

    const guestRows = await notificationsOf(guest.user.id);
    expect(guestRows).toHaveLength(1);
    expect(guestRows[0]).toMatchObject({
      eventData: { status: "delivered" },
    });
  });

  it("tells the managers when the guest asks for a revision", async () => {
    const { guest, manager, request } = await submitted();

    await moveAs(manager.user, request.id, "approved");
    await moveAs(manager.user, request.id, "in_progress");
    await moveAs(manager.user, request.id, "delivered");
    await moveAs(guest.user, request.id, "needs_revision", "Still broken");

    const managerRows = await notificationsOf(manager.user.id);
    expect(managerRows.map((row) => row.type).sort()).toEqual([
      "intake_request_created",
      "intake_request_guest_reply",
    ]);
    expect(managerRows.at(-1)).toMatchObject({
      eventData: { status: "needs_revision" },
    });
    expect(await notificationsOf(guest.user.id)).toHaveLength(1);
  });

  it("tells the managers when the guest confirms delivery", async () => {
    const { guest, manager, request } = await submitted();

    await moveAs(manager.user, request.id, "approved");
    await moveAs(manager.user, request.id, "in_progress");
    await moveAs(manager.user, request.id, "delivered");
    await moveAs(guest.user, request.id, "confirmed");

    const managerRows = await notificationsOf(manager.user.id);
    expect(managerRows.map((row) => row.eventData?.status)).toEqual([
      null,
      "confirmed",
    ]);
    expect(await notificationsOf(guest.user.id)).toHaveLength(1);
  });
});
