import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { insertUnplacedProject } from "../../apps/api/src/project/controllers/insert-project";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];
type Field = typeof schema.workspaceCustomFieldDefinitionTable.$inferSelect;

beforeEach(resetTestDatabase);

async function createField(
  app: App,
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<Field> {
  const response = await app.request("/api/project-field", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId, ...body }),
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as Field;
}

async function setValue(
  app: App,
  projectId: string,
  fieldId: string,
  value: string | null,
) {
  return app.request(`/api/project-field/project/${projectId}/value`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fieldId, value }),
  });
}

async function valuesFor(app: App, projectId: string) {
  const response = await app.request(`/api/project-field/project/${projectId}`);
  expect(response.status).toBe(200);
  return (await response.json()) as Array<{
    id: string;
    value: string | null;
    computedValue: string | null;
  }>;
}

async function createProject(app: App, workspaceId: string) {
  const response = await app.request("/api/project", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      name: "Created through the API",
      icon: "Folder",
      slug: `KAN-${randomUUID().slice(0, 6).toUpperCase()}`,
    }),
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as { id: string };
}

async function fixture() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  return { member, project, app, workspaceId: member.workspace.id };
}

describe("project field lifecycle", () => {
  it("backfills defaults on existing and archived projects and seeds new ones", async () => {
    const { app, project, workspaceId } = await fixture();

    const archived = await createProjectFixture({
      workspaceId,
      name: "Archived",
    });
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date("2026-01-01T00:00:00.000Z") })
      .where(eq(schema.projectTable.id, archived.project.id));

    const defaulted = await createField(app, workspaceId, {
      name: "Visibility",
      type: "dropdown",
      options: ["Internal", "Public"],
      defaultValue: "Internal",
    });

    for (const projectId of [project.id, archived.project.id]) {
      expect(await valuesFor(app, projectId)).toContainEqual(
        expect.objectContaining({ id: defaulted.id, value: "Internal" }),
      );
    }

    const created = await createProject(app, workspaceId);
    expect(await valuesFor(app, created.id)).toContainEqual(
      expect.objectContaining({ id: defaulted.id, value: "Internal" }),
    );

    const imported = await db.transaction(async (tx) =>
      insertUnplacedProject(tx, {
        workspaceId,
        name: "Imported",
        icon: "Folder",
        slug: `IMP-${randomUUID().slice(0, 6).toUpperCase()}`,
        userId: (await db.select().from(schema.workspaceUserTable).limit(1))[0]
          .userId,
      }),
    );
    expect(await valuesFor(app, imported.id)).toContainEqual(
      expect.objectContaining({ id: defaulted.id, value: "Internal" }),
    );
  });

  it("turning a field required fills empty values without overwriting entries", async () => {
    const { app, project, workspaceId } = await fixture();
    const other = await createProjectFixture({ workspaceId, name: "Other" });

    const field = await createField(app, workspaceId, {
      name: "Owner",
      type: "text",
    });
    await setValue(app, project.id, field.id, "Existing");

    const response = await app.request(`/api/project-field/${field.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ required: true, defaultValue: "Unassigned" }),
    });
    expect(response.status, await response.text()).toBe(200);

    expect(await valuesFor(app, project.id)).toContainEqual(
      expect.objectContaining({ id: field.id, value: "Existing" }),
    );
    expect(await valuesFor(app, other.project.id)).toContainEqual(
      expect.objectContaining({ id: field.id, value: "Unassigned" }),
    );
  });

  it("converts dropdown and multiselect values", async () => {
    const { app, project, workspaceId } = await fixture();

    const field = await createField(app, workspaceId, {
      name: "Products",
      type: "multiselect",
      options: ["Core", "Reports"],
    });
    await setValue(app, project.id, field.id, '["Core"]');

    const toDropdown = await app.request(`/api/project-field/${field.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "dropdown" }),
    });
    expect(toDropdown.status, await toDropdown.text()).toBe(200);
    expect(await valuesFor(app, project.id)).toContainEqual(
      expect.objectContaining({ id: field.id, value: "Core" }),
    );

    const toMultiselect = await app.request(`/api/project-field/${field.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "multiselect" }),
    });
    expect(toMultiselect.status, await toMultiselect.text()).toBe(200);
    expect(await valuesFor(app, project.id)).toContainEqual(
      expect.objectContaining({ id: field.id, value: '["Core"]' }),
    );

    await setValue(app, project.id, field.id, '["Core","Reports"]');
    const blocked = await app.request(`/api/project-field/${field.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "dropdown" }),
    });
    expect(blocked.status).toBe(400);
    expect(await blocked.text()).toContain("projects");
  });

  it("cascades values on definition and project deletion and keeps archived values", async () => {
    const { app, project, workspaceId } = await fixture();
    const field = await createField(app, workspaceId, {
      name: "Customer",
      type: "text",
    });
    await setValue(app, project.id, field.id, "Acme");

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, project.id));
    expect(await valuesFor(app, project.id)).toContainEqual(
      expect.objectContaining({ id: field.id, value: "Acme" }),
    );
    await db
      .update(schema.projectTable)
      .set({ archivedAt: null })
      .where(eq(schema.projectTable.id, project.id));

    const second = await createProjectFixture({ workspaceId, name: "Second" });
    await setValue(app, second.project.id, field.id, "Beta");

    const deletedField = await app.request(`/api/project-field/${field.id}`, {
      method: "DELETE",
    });
    expect(deletedField.status).toBe(200);
    const remaining = await db
      .select()
      .from(schema.projectCustomFieldValueTable)
      .where(eq(schema.projectCustomFieldValueTable.fieldId, field.id));
    expect(remaining).toHaveLength(0);

    const kept = await createField(app, workspaceId, {
      name: "Stage",
      type: "text",
    });
    await setValue(app, project.id, kept.id, "Live");
    const deletedProject = await app.request(`/api/project/${project.id}`, {
      method: "DELETE",
    });
    expect(deletedProject.status).toBe(200);
    const projectValues = await db
      .select()
      .from(schema.projectCustomFieldValueTable)
      .where(eq(schema.projectCustomFieldValueTable.projectId, project.id));
    expect(projectValues).toHaveLength(0);
  });

  it("moves a project to another workspace with destination defaults", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const [targetWorkspace] = await db
      .insert(schema.workspaceTable)
      .values({
        name: "Target",
        slug: `target-${randomUUID()}`,
        createdAt: new Date(),
      })
      .returning();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: targetWorkspace.id,
      userId: member.user.id,
      role: "owner",
      joinedAt: new Date(),
    });

    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    mockAuthenticatedSession(member.user);
    const app = createApp().app;

    const sourceField = await createField(app, member.workspace.id, {
      name: "Source only",
      type: "text",
      defaultValue: "Source default",
    });
    const targetField = await createField(app, targetWorkspace.id, {
      name: "Target only",
      type: "text",
      defaultValue: "Target default",
    });
    await setValue(app, project.id, sourceField.id, "Source value");

    const moved = await app.request(`/api/project/${project.id}/move`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: targetWorkspace.id }),
    });
    expect(moved.status, await moved.text()).toBe(200);

    const rows = await db
      .select()
      .from(schema.projectCustomFieldValueTable)
      .where(eq(schema.projectCustomFieldValueTable.projectId, project.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fieldId: targetField.id,
      value: "Target default",
    });
    expect(rows[0]).not.toMatchObject({ fieldId: sourceField.id });
  });
});
