import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { projectAccessApi } from "./helpers/project-access/project-access-api";

beforeEach(resetTestDatabase);

async function createField(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
  body: Record<string, unknown>,
) {
  const response = await app.request("/api/project-field", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId, ...body }),
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as { id: string };
}

async function setValue(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  fieldId: string,
  value: string,
) {
  await app.request(`/api/project-field/project/${projectId}/value`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fieldId, value }),
  });
}

describe("project field table security", () => {
  it("scopes rows and total to accessible projects", async () => {
    const ctx = await createRestrictedWorkspace();
    mockAuthenticatedSession(ctx.owner);
    const ownerApp = createApp().app;
    const field = await createField(ownerApp, ctx.workspace.id, {
      name: "Customer",
      type: "text",
      defaultValue: "Shared",
    });
    await setValue(ownerApp, ctx.alpha.id, field.id, "Alpha customer");
    await setValue(ownerApp, ctx.beta.id, field.id, "Beta secret");

    mockAuthenticatedSession(ctx.restricted);
    const request = projectAccessApi();
    const response = await request(`/project-field/table/${ctx.workspace.id}`);
    expect(response.status).toBe(200);
    const text = await response.text();
    const body = JSON.parse(text) as {
      total: number;
      projects: Array<{ id: string; name: string }>;
    };

    expect(body.total).toBe(1);
    expect(body.projects.map((project) => project.id)).toEqual([ctx.alpha.id]);
    expect(text).not.toContain("Beta");
    expect(text).not.toContain("Beta secret");
  });

  it("requires project:read for custom roles and API keys", async () => {
    const member = await createWorkspaceMember({ role: "limited" });
    const [project] = await db
      .insert(schema.projectTable)
      .values({
        workspaceId: member.workspace.id,
        name: "Limited",
        slug: `limited-${randomUUID()}`,
      })
      .returning();
    expect(project).toBeDefined();
    const app = createApp().app;

    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: member.workspace.id,
      role: "limited",
      permission: JSON.stringify({ workspace: ["read"] }),
    });
    mockAuthenticatedSession(member.user);
    const denied = await app.request(
      `/api/project-field/table/${member.workspace.id}`,
    );
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("MISSING_PERMISSION");

    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: member.workspace.id,
      role: "limited",
      permission: JSON.stringify({ workspace: ["read"], project: ["read"] }),
    });
    const allowed = await app.request(
      `/api/project-field/table/${member.workspace.id}`,
    );
    expect(allowed.status).toBe(200);

    mockAnonymousSession();
    const key = `test_${randomUUID()}`;
    await db.insert(schema.apikeyTable).values({
      referenceId: member.user.id,
      userId: member.user.id,
      key: createHash("sha256").update(key).digest("base64url"),
      permissions: JSON.stringify({ workspace: ["read"] }),
      enabled: true,
      rateLimitEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const scopedOut = await app.request(
      `/api/project-field/table/${member.workspace.id}`,
      { headers: { "x-api-key": key } },
    );
    expect(scopedOut.status).toBe(403);
    expect((await scopedOut.json()).code).toBe("API_KEY_SCOPE");
  });

  it("returns 404 for a workspace the caller does not belong to", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(member.user);
    const app = createApp().app;

    const other = await createWorkspaceMember({ role: "owner" });
    const response = await app.request(
      `/api/project-field/table/${other.workspace.id}`,
    );
    expect(response.status).toBe(404);
  });
});
