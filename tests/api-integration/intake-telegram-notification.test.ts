import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { initializePlugins } from "../../apps/api/src/plugins";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const mocks = vi.hoisted(() => ({ postToTelegram: vi.fn() }));

vi.mock("../../apps/api/src/plugins/telegram/client", () => ({
  postToTelegram: mocks.postToTelegram,
}));

vi.mock("../../apps/api/src/events", async (original) => {
  const events = await original<typeof import("../../apps/api/src/events")>();
  return {
    ...events,
    // Plugin dispatch is a subscriber; assertions need it finished first.
    publishEvent: (...args: Parameters<typeof events.publishEvent>) =>
      events.publishEvent(args[0], args[1], { waitForHandlers: true }),
  };
});

// createApp does not run the server bootstrap that wires plugin subscribers.
initializePlugins();

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  mocks.postToTelegram.mockResolvedValue(undefined);
});

const botToken = `12345678:${"x".repeat(35)}`;

async function fixture(events: Record<string, boolean> = {}) {
  const guest = await createWorkspaceMember({ role: "guest" });
  const { project } = await createProjectFixture({
    workspaceId: guest.workspace.id,
  });
  await db
    .update(schema.projectTable)
    .set({ intakeEnabled: true })
    .where(eq(schema.projectTable.id, project.id));
  await db.insert(schema.integrationTable).values({
    projectId: project.id,
    type: "telegram",
    config: JSON.stringify({
      botToken,
      chatId: "-1001234567890",
      events: { intakeRequestCreated: true, ...events },
    }),
    isActive: true,
  });

  mockAuthenticatedSession(guest.user);

  return { guest, project };
}

function submit(workspaceId: string, projectId: string, title: string) {
  return createApp().app.request(
    `/api/intake/workspaces/${workspaceId}/intake-requests`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, title }),
    },
  );
}

describe("a new intake request reaches the project's Telegram chat", () => {
  it("posts the request once, for the whole integration", async () => {
    const { guest, project } = await fixture();

    const response = await submit(
      guest.workspace.id,
      project.id,
      "Printer down",
    );
    expect(response.status).toBe(200);
    await vi.waitFor(() =>
      expect(mocks.postToTelegram).toHaveBeenCalledTimes(1),
    );

    const [token, message] = mocks.postToTelegram.mock.calls[0] as [
      string,
      { text: string; chat_id: string },
    ];
    expect(token).toBe(botToken);
    expect(message.chat_id).toBe("-1001234567890");
    expect(message.text).toContain("Printer down");
    expect(message.text).toContain("REQ-1");
  });

  it("stays quiet when the integration switched the event off", async () => {
    const { guest, project } = await fixture({ intakeRequestCreated: false });

    await submit(guest.workspace.id, project.id, "Printer down");

    expect(mocks.postToTelegram).not.toHaveBeenCalled();
  });

  it("keeps the request even when Telegram rejects the message", async () => {
    const { guest, project } = await fixture();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.postToTelegram.mockRejectedValue(new Error("telegram is down"));

    const response = await submit(
      guest.workspace.id,
      project.id,
      "Printer down",
    );

    expect(response.status).toBe(200);
    const [row] = await db
      .select({ title: schema.intakeRequestTable.title })
      .from(schema.intakeRequestTable);
    expect(row?.title).toBe("Printer down");
  });
});
