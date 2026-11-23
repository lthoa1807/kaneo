import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function seedField(role: string) {
  const member = await createWorkspaceMember({ role });
  const [field] = await db
    .insert(schema.workspaceCustomFieldDefinitionTable)
    .values({
      workspaceId: member.workspace.id,
      name: "Customer",
      type: "text",
      position: 1,
    })
    .returning();
  if (!field) throw new Error("Failed to seed project field");
  mockAuthenticatedSession(member.user);
  return { member, field, app: createApp().app };
}

describe("project field definition authorization", () => {
  it("allows workspace readers to list definitions", async () => {
    const { member, field, app } = await seedField("viewer");
    const response = await app.request(
      `/api/project-field/workspace/${member.workspace.id}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: field.id, name: "Customer" }),
    ]);
  });

  it("requires workspace manage_settings for every definition write and usage read", async () => {
    const { member, field, app } = await seedField("member");
    const requests = [
      app.request("/api/project-field", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: member.workspace.id,
          name: "Blocked",
          type: "text",
        }),
      }),
      app.request(`/api/project-field/${field.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      }),
      app.request(`/api/project-field/${field.id}`, { method: "DELETE" }),
      app.request(`/api/project-field/${field.id}/usage`),
      app.request(`/api/project-field/reorder/${member.workspace.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: [{ id: field.id, position: 0 }] }),
      }),
    ];

    expect(
      (await Promise.all(requests)).map((response) => response.status),
    ).toEqual([403, 403, 403, 403, 403]);
    const [stored] = await db
      .select()
      .from(schema.workspaceCustomFieldDefinitionTable)
      .where(eq(schema.workspaceCustomFieldDefinitionTable.id, field.id));
    expect(stored).toMatchObject({ name: "Customer", position: 1 });
  });

  it("allows a custom role with manage_settings to create a definition", async () => {
    const member = await createWorkspaceMember({ role: "settings-manager" });
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: member.workspace.id,
      role: "settings-manager",
      permission: JSON.stringify({
        workspace: ["read", "manage_settings"],
      }),
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/project-field", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: member.workspace.id,
        name: "Customer",
        type: "text",
      }),
    });
    expect(response.status, await response.text()).toBe(200);
  });

  it("returns 404 for another workspace without exposing the definition", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const [field] = await db
      .insert(schema.workspaceCustomFieldDefinitionTable)
      .values({
        workspaceId: owner.workspace.id,
        name: "Private customer",
        type: "text",
        position: 1,
      })
      .returning();
    if (!field) throw new Error("Failed to seed project field");

    const outsider = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(outsider.user);
    const { app } = createApp();

    const responses = await Promise.all([
      app.request(`/api/project-field/workspace/${owner.workspace.id}`),
      app.request(`/api/project-field/${field.id}/usage`),
      app.request(`/api/project-field/${field.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Leaked" }),
      }),
      app.request(`/api/project-field/${field.id}`, { method: "DELETE" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404,
    ]);
    for (const response of responses) {
      expect(await response.text()).not.toContain("Private customer");
    }
  });

  it("does not accept a task custom-field id on project-field routes", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const [project] = await db
      .insert(schema.projectTable)
      .values({
        workspaceId: member.workspace.id,
        name: "Project",
        slug: `project-${randomUUID()}`,
      })
      .returning();
    if (!project) throw new Error("Failed to seed project");
    const [taskField] = await db
      .insert(schema.customFieldDefinitionTable)
      .values({
        projectId: project.id,
        name: "Task only",
        type: "text",
        position: 1,
      })
      .returning();
    if (!taskField) throw new Error("Failed to seed task field");
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const responses = await Promise.all([
      app.request(`/api/project-field/${taskField.id}/usage`),
      app.request(`/api/project-field/${taskField.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Still task only" }),
      }),
      app.request(`/api/project-field/${taskField.id}`, { method: "DELETE" }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404,
    ]);
  });
});
