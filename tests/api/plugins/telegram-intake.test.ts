import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { handleIntakeRequestCreated } from "../../../apps/api/src/plugins/telegram/events";

const m = vi.hoisted(() => ({ select: vi.fn(), send: vi.fn() }));

vi.mock("../../../apps/api/src/database", () => ({
  default: { select: m.select },
}));
vi.mock("../../../apps/api/src/plugins/telegram/client", () => ({
  postToTelegram: m.send,
}));

const token = `12345678:${"x".repeat(35)}`;
const config = { botToken: token, chatId: "-1001234567890" };

const event = {
  requestId: "request",
  projectId: "project",
  number: 3,
  title: "Dashboard CSV export fails on large workspaces",
  status: "new",
  sourceType: "guest_portal",
  requesterName: "Guest One",
  requesterEmail: "guest1@example.test",
  createdById: "guest-user",
};

function chain(rows: unknown[]) {
  const value = {
    from: () => value,
    innerJoin: () => value,
    where: () => value,
    limit: async () => rows,
  };
  return value;
}

function projectRow() {
  return [
    {
      projectName: "UAT Project 1",
      projectId: "project",
      workspaceId: "workspace",
    },
  ];
}

beforeEach(() => {
  process.env.KANEO_CLIENT_URL = "https://kaneo.test";
  m.select.mockReturnValue(chain(projectRow()));
});

afterEach(() => {
  delete process.env.KANEO_CLIENT_URL;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("Telegram intake notifications", () => {
  it("announces the request with its number, requester and staff link", async () => {
    m.send.mockResolvedValue(undefined);

    await handleIntakeRequestCreated(event, {
      integrationId: "integration",
      projectId: "project",
      config,
    });

    expect(m.send).toHaveBeenCalledTimes(1);
    const [, message] = m.send.mock.calls[0] as [
      string,
      { text: string; chat_id: string },
    ];
    expect(message.chat_id).toBe(config.chatId);
    expect(message.text).toContain("REQ-3");
    expect(message.text).toContain("Dashboard CSV export fails");
    expect(message.text).toContain("Guest One (guest1@example.test)");
    expect(message.text).toContain("UAT Project 1");
    expect(message.text).toContain(
      "https://kaneo.test/dashboard/workspace/workspace/project/project/intake/request",
    );
  });

  it("escapes a title a guest could have written as markup", async () => {
    m.send.mockResolvedValue(undefined);

    await handleIntakeRequestCreated(
      { ...event, title: "<b>bold</b> & paid" },
      { integrationId: "integration", projectId: "project", config },
    );

    const [, message] = m.send.mock.calls[0] as [string, { text: string }];
    expect(message.text).not.toContain("<b>bold</b>");
    expect(message.text).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; paid");
  });

  it("stays quiet when the event is switched off", async () => {
    await handleIntakeRequestCreated(event, {
      integrationId: "integration",
      projectId: "project",
      config: { ...config, events: { intakeRequestCreated: false } },
    });

    expect(m.send).not.toHaveBeenCalled();
  });

  it("does not leak the bot token when the config or the call fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleIntakeRequestCreated(event, {
      integrationId: "integration",
      projectId: "project",
      config: { botToken: token, chatId: "" },
    });
    expect(m.send).not.toHaveBeenCalled();

    m.select.mockReturnValue(chain(projectRow()));
    m.send.mockRejectedValue(new Error(`failed for bot${token}`));
    await handleIntakeRequestCreated(event, {
      integrationId: "integration",
      projectId: "project",
      config,
    });

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  });

  it("renders the request label without a link when no client URL is set", async () => {
    delete process.env.KANEO_CLIENT_URL;
    m.send.mockResolvedValue(undefined);

    await handleIntakeRequestCreated(event, {
      integrationId: "integration",
      projectId: "project",
      config,
    });

    const [, message] = m.send.mock.calls[0] as [string, { text: string }];
    expect(message.text).toContain("REQ-3");
    expect(message.text).not.toContain("http");
  });
});
