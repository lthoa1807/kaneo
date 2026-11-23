import { once } from "node:events";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { serve } from "../../apps/api/node_modules/@hono/node-server";
import type { NodeWebSocket } from "../../apps/api/node_modules/@hono/node-ws";
import { auth } from "../../apps/api/src/auth";
import { createApp } from "../../apps/api/src/index";
import createProjectField from "../../apps/api/src/project-field/controllers/create-project-field";
import setProjectFieldValue from "../../apps/api/src/project-field/controllers/set-project-field-value";
import { shutdownWebSocketAdapter } from "../../apps/api/src/ws";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  type SeededMemberContext,
} from "./helpers/fixtures";

type Socket = NodeWebSocket["wss"]["clients"] extends Set<infer S> ? S : never;
const apiRequire = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const WebSocket: new (
  url: string,
  options: { headers: Record<string, string> },
) => Socket = createRequire(apiRequire.resolve("@hono/node-ws"))(
  "ws",
).WebSocket;

let server: ReturnType<typeof serve>;
let baseUrl: string;
const sockets: Socket[] = [];
const sessionMock = vi.spyOn(auth.api, "getSession");

function sessionFor(member: SeededMemberContext) {
  const now = new Date();
  return {
    session: {
      id: `session-${member.user.id}`,
      token: `token-${member.user.id}`,
      userId: member.user.id,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
      ipAddress: null,
      userAgent: null,
    },
    user: member.user,
  };
}

function tokenFor(member: SeededMemberContext) {
  return `token-${member.user.id}`;
}

async function connect(member: SeededMemberContext) {
  const socket = new WebSocket(`${baseUrl}/api/ws/user`, {
    headers: {
      cookie: `${tokenFor(member)}=1`,
      origin: "http://localhost:5173",
    },
  });
  sockets.push(socket);
  socket.on("error", () => {});
  const status = await new Promise<number>((resolve) => {
    socket.once("open", () => resolve(101));
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
      socket.terminate();
    });
  });
  return { socket, status };
}

function nextMessage(
  socket: Socket,
  predicate: (message: Record<string, unknown>) => boolean,
  timeout = 2_000,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for a WebSocket message")),
      timeout,
    );
    const listener = (raw: { toString(): string }) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", listener);
      resolve(message);
    };
    socket.on("message", listener);
  });
}

function noMessage(socket: Socket, timeout = 300) {
  return new Promise<void>((resolve, reject) => {
    const listener = (raw: { toString(): string }) => {
      const message = JSON.parse(raw.toString()) as { type?: string };
      if (!message.type?.startsWith("PROJECT_FIELD_")) return;
      reject(new Error(`Unexpected message: ${raw.toString()}`));
    };
    socket.on("message", listener);
    setTimeout(() => {
      socket.off("message", listener);
      resolve();
    }, timeout);
  });
}

beforeEach(async () => {
  await resetTestDatabase();
  const member = await createWorkspaceMember({ role: "owner" });
  const outsider = await createWorkspaceMember();
  const sessions = new Map([
    [tokenFor(member), sessionFor(member)],
    [tokenFor(outsider), sessionFor(outsider)],
  ]);
  sessionMock.mockImplementation(async ({ headers }) => {
    const cookie = new Headers(headers).get("cookie") ?? "";
    const token = cookie.split("=")[0];
    return sessions.get(token) ?? null;
  });

  const created = createApp();
  server = serve({ fetch: created.app.fetch, hostname: "127.0.0.1", port: 0 });
  created.injectWebSocket(server);
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  baseUrl = `ws://127.0.0.1:${address.port}`;
  current = { member, outsider };
});

let current: { member: SeededMemberContext; outsider: SeededMemberContext };

afterEach(async () => {
  await shutdownWebSocketAdapter();
  for (const socket of sockets.splice(0)) socket.terminate();
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

it("delivers field changes to workspace members and never to outsiders", async () => {
  const { member, outsider } = current;
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const memberSocket = await connect(member);
  const outsiderSocket = await connect(outsider);
  expect(memberSocket.status).toBe(101);
  expect(outsiderSocket.status).toBe(101);

  const outsiderQuiet = noMessage(outsiderSocket.socket);

  const definitionsChanged = nextMessage(
    memberSocket.socket,
    (message) => message.type === "PROJECT_FIELD_DEFINITIONS_CHANGED",
  );
  const field = await createProjectField({
    workspaceId: member.workspace.id,
    name: "Customer",
    type: "text",
  });
  expect(await definitionsChanged).toEqual({
    type: "PROJECT_FIELD_DEFINITIONS_CHANGED",
    workspaceId: member.workspace.id,
  });

  const valuesChanged = nextMessage(
    memberSocket.socket,
    (message) => message.type === "PROJECT_FIELD_VALUES_CHANGED",
  );
  await setProjectFieldValue({
    projectId: project.id,
    fieldId: field.id,
    value: "Acme",
  });
  // No project or field id on the wire: an outsider or restricted member
  // learns nothing about projects it cannot read, and clients refetch.
  expect(await valuesChanged).toEqual({
    type: "PROJECT_FIELD_VALUES_CHANGED",
    workspaceId: member.workspace.id,
  });

  const clearedChanged = nextMessage(
    memberSocket.socket,
    (message) => message.type === "PROJECT_FIELD_VALUES_CHANGED",
  );
  await setProjectFieldValue({
    projectId: project.id,
    fieldId: field.id,
    value: null,
  });
  // Clearing publishes the same event. Without the workspace id the socket
  // layer drops it and other clients keep showing the deleted value.
  expect(await clearedChanged).toEqual({
    type: "PROJECT_FIELD_VALUES_CHANGED",
    workspaceId: member.workspace.id,
  });

  await outsiderQuiet;
});
