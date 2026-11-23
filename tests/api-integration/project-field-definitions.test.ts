import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];
type Definition =
  typeof schema.workspaceCustomFieldDefinitionTable.$inferSelect;

beforeEach(resetTestDatabase);

async function insertProject(workspaceId: string, name: string) {
  const [project] = await db
    .insert(schema.projectTable)
    .values({
      workspaceId,
      name,
      slug: `project-${randomUUID()}`,
    })
    .returning();
  if (!project) throw new Error("Failed to create project fixture");
  return project;
}

async function fixture() {
  const member = await createWorkspaceMember({ role: "admin" });
  const firstProject = await insertProject(member.workspace.id, "Active");
  const archivedProject = await insertProject(member.workspace.id, "Archived");
  await db
    .update(schema.projectTable)
    .set({ archivedAt: new Date("2026-01-01T00:00:00.000Z") })
    .where(eq(schema.projectTable.id, archivedProject.id));
  mockAuthenticatedSession(member.user);
  return {
    member,
    firstProject,
    archivedProject,
    app: createApp().app,
  };
}

async function createField(
  app: App,
  body: Record<string, unknown>,
): Promise<Definition> {
  const response = await app.request("/api/project-field", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as Definition;
}

async function updateField(
  app: App,
  id: string,
  body: Record<string, unknown>,
) {
  return app.request(`/api/project-field/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("project field definitions", () => {
  it("creates every field type, lists them in position order, and backfills defaults", async () => {
    const { member, firstProject, archivedProject, app } = await fixture();
    const workspaceId = member.workspace.id;

    const empty = await app.request(
      `/api/project-field/workspace/${workspaceId}`,
    );
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    const customer = await createField(app, {
      workspaceId,
      name: "Customer",
      type: "text",
      defaultValue: "Acme",
    });
    await createField(app, {
      workspaceId,
      name: "Notes",
      type: "long_text",
    });
    await createField(app, {
      workspaceId,
      name: "Effort",
      type: "number",
      defaultValue: "2.5",
    });
    const goLive = await createField(app, {
      workspaceId,
      name: "Go live",
      type: "date",
      defaultValue: "2026-12-01",
    });
    await createField(app, {
      workspaceId,
      name: "Stage",
      type: "dropdown",
      options: ["Planned", "Live"],
      defaultValue: "Planned",
    });
    await createField(app, {
      workspaceId,
      name: "Products",
      type: "multiselect",
      options: ["Core", "Reports"],
      defaultValue: '["Core"]',
    });
    await createField(app, {
      workspaceId,
      name: "Ready",
      type: "boolean",
      defaultValue: "false",
    });
    const warranty = await createField(app, {
      workspaceId,
      name: "Warranty end",
      type: "formula",
      formula: {
        kind: "date_add",
        fromFieldId: goLive.id,
        amount: 12,
        unit: "month",
      },
    });

    expect(customer).toMatchObject({
      workspaceId,
      name: "Customer",
      type: "text",
      position: 1,
    });
    expect(warranty).toMatchObject({
      required: false,
      defaultValue: null,
      options: null,
      formula: {
        kind: "date_add",
        fromFieldId: goLive.id,
        amount: 12,
        unit: "month",
      },
      position: 8,
    });

    const listResponse = await app.request(
      `/api/project-field/workspace/${workspaceId}`,
    );
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as Definition[];
    expect(listed.map((field) => field.name)).toEqual([
      "Customer",
      "Notes",
      "Effort",
      "Go live",
      "Stage",
      "Products",
      "Ready",
      "Warranty end",
    ]);
    expect(listed.map((field) => field.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);

    const values = await db.select().from(schema.projectCustomFieldValueTable);
    expect(values).toHaveLength(12);
    expect(
      values.some(
        (value) =>
          value.projectId === firstProject.id &&
          value.fieldId === customer.id &&
          value.value === "Acme",
      ),
    ).toBe(true);
    expect(
      values.some(
        (value) =>
          value.projectId === archivedProject.id &&
          value.fieldId === customer.id &&
          value.value === "Acme",
      ),
    ).toBe(true);
    expect(values.some((value) => value.fieldId === warranty.id)).toBe(false);
  });

  it("rejects invalid defaults, option sets, and formula sources without writes", async () => {
    const { member, app } = await fixture();
    const workspaceId = member.workspace.id;
    const date = await createField(app, {
      workspaceId,
      name: "Start",
      type: "date",
    });
    const number = await createField(app, {
      workspaceId,
      name: "Budget",
      type: "number",
    });
    const nested = await createField(app, {
      workspaceId,
      name: "Adjusted start",
      type: "formula",
      formula: {
        kind: "date_add",
        fromFieldId: date.id,
        amount: 1,
        unit: "day",
      },
    });
    const other = await createWorkspaceMember({ role: "admin" });
    const [foreignDate] = await db
      .insert(schema.workspaceCustomFieldDefinitionTable)
      .values({
        workspaceId: other.workspace.id,
        name: "Foreign date",
        type: "date",
        position: 1,
      })
      .returning();
    if (!foreignDate) throw new Error("Failed to create foreign field");

    const invalidBodies: Array<Record<string, unknown>> = [
      { workspaceId, name: "", type: "text" },
      { workspaceId, name: "Text options", type: "text", options: ["A"] },
      { workspaceId, name: "No options", type: "dropdown" },
      {
        workspaceId,
        name: "One option",
        type: "multiselect",
        options: ["Only"],
      },
      { workspaceId, name: "Required", type: "text", required: true },
      {
        workspaceId,
        name: "Invalid date",
        type: "date",
        defaultValue: "2026-02-30",
      },
      {
        workspaceId,
        name: "Datetime",
        type: "date",
        defaultValue: "2026-02-28T12:00:00Z",
      },
      { workspaceId, name: "Missing formula", type: "formula" },
      {
        workspaceId,
        name: "Required formula",
        type: "formula",
        required: true,
        formula: {
          kind: "date_add",
          fromFieldId: date.id,
          amount: 1,
          unit: "day",
        },
      },
      {
        workspaceId,
        name: "Default formula",
        type: "formula",
        defaultValue: "1",
        formula: {
          kind: "date_add",
          fromFieldId: date.id,
          amount: 1,
          unit: "day",
        },
      },
      {
        workspaceId,
        name: "Options formula",
        type: "formula",
        options: ["A"],
        formula: {
          kind: "date_add",
          fromFieldId: date.id,
          amount: 1,
          unit: "day",
        },
      },
      {
        workspaceId,
        name: "Fractional calendar",
        type: "formula",
        formula: {
          kind: "date_add",
          fromFieldId: date.id,
          amount: 1.5,
          unit: "month",
        },
      },
      {
        workspaceId,
        name: "Wrong date source",
        type: "formula",
        formula: {
          kind: "date_add",
          fromFieldId: number.id,
          amount: 1,
          unit: "day",
        },
      },
      {
        workspaceId,
        name: "Wrong number source",
        type: "formula",
        formula: {
          kind: "number",
          op: "add",
          leftFieldId: number.id,
          rightFieldId: date.id,
        },
      },
      {
        workspaceId,
        name: "Nested formula",
        type: "formula",
        formula: {
          kind: "date_add",
          fromFieldId: nested.id,
          amount: 1,
          unit: "day",
        },
      },
      {
        workspaceId,
        name: "Foreign formula",
        type: "formula",
        formula: {
          kind: "date_add",
          fromFieldId: foreignDate.id,
          amount: 1,
          unit: "day",
        },
      },
    ];

    for (const body of invalidBodies) {
      const response = await app.request("/api/project-field", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(
        response.status,
        `${String(body.name)}: ${await response.text()}`,
      ).toBe(400);
    }

    const definitions = await db
      .select()
      .from(schema.workspaceCustomFieldDefinitionTable)
      .where(
        eq(schema.workspaceCustomFieldDefinitionTable.workspaceId, workspaceId),
      );
    expect(definitions.map((field) => field.id).sort()).toEqual(
      [date.id, number.id, nested.id].sort(),
    );
  });

  it("updates compatible definitions and rejects immutable or duplicate changes", async () => {
    const { member, app } = await fixture();
    const workspaceId = member.workspace.id;
    const customer = await createField(app, {
      workspaceId,
      name: "Customer",
      type: "text",
    });
    const stage = await createField(app, {
      workspaceId,
      name: "Stage",
      type: "dropdown",
      options: ["A", "B"],
      defaultValue: "A",
    });
    const start = await createField(app, {
      workspaceId,
      name: "Start",
      type: "date",
    });
    const formula = await createField(app, {
      workspaceId,
      name: "Adjusted start",
      type: "formula",
      formula: {
        kind: "date_add",
        fromFieldId: start.id,
        amount: 1,
        unit: "day",
      },
    });

    expect(
      (await updateField(app, customer.id, { type: "number" })).status,
    ).toBe(400);

    const convertedResponse = await updateField(app, stage.id, {
      type: "multiselect",
      hiddenOptions: ["B"],
    });
    expect(convertedResponse.status).toBe(200);
    const converted = (await convertedResponse.json()) as Definition;
    expect(converted).toMatchObject({
      type: "multiselect",
      defaultValue: '["A"]',
      options: ["A", "B"],
      hiddenOptions: ["B"],
    });

    const formulaResponse = await updateField(app, formula.id, {
      formula: {
        kind: "date_add",
        fromFieldId: start.id,
        amount: 2,
        unit: "month",
      },
    });
    expect(formulaResponse.status).toBe(200);
    expect(await formulaResponse.json()).toMatchObject({
      formula: {
        kind: "date_add",
        fromFieldId: start.id,
        amount: 2,
        unit: "month",
      },
    });

    expect(
      (await updateField(app, formula.id, { required: true })).status,
    ).toBe(400);

    const duplicate = await updateField(app, stage.id, {
      name: customer.name,
    });
    expect(duplicate.status).toBe(409);
    const [storedStage] = await db
      .select()
      .from(schema.workspaceCustomFieldDefinitionTable)
      .where(eq(schema.workspaceCustomFieldDefinitionTable.id, stage.id));
    expect(storedStage?.name).toBe("Stage");
  });

  it("reports usage, protects formula sources, and reorders atomically", async () => {
    const { member, firstProject, app } = await fixture();
    const workspaceId = member.workspace.id;
    const source = await createField(app, {
      workspaceId,
      name: "Start",
      type: "date",
    });
    const formula = await createField(app, {
      workspaceId,
      name: "End",
      type: "formula",
      formula: {
        kind: "date_add",
        fromFieldId: source.id,
        amount: 1,
        unit: "month",
      },
    });
    await db.insert(schema.projectCustomFieldValueTable).values({
      projectId: firstProject.id,
      fieldId: source.id,
      value: "2026-01-31",
    });

    const usageResponse = await app.request(
      `/api/project-field/${source.id}/usage`,
    );
    expect(usageResponse.status).toBe(200);
    expect(await usageResponse.json()).toEqual({
      projectCount: 2,
      valueCount: 1,
      dependentFormulaCount: 1,
      dependentFormulas: [{ id: formula.id, name: "End" }],
    });

    const blockedDelete = await app.request(`/api/project-field/${source.id}`, {
      method: "DELETE",
    });
    expect(blockedDelete.status).toBe(409);
    expect(await blockedDelete.json()).toMatchObject({
      code: "PROJECT_FIELD_IN_USE",
      issues: [{ path: formula.id, message: "End" }],
    });

    const foreign = await createWorkspaceMember({ role: "admin" });
    const [foreignField] = await db
      .insert(schema.workspaceCustomFieldDefinitionTable)
      .values({
        workspaceId: foreign.workspace.id,
        name: "Foreign",
        type: "text",
        position: 1,
      })
      .returning();
    if (!foreignField) throw new Error("Failed to create foreign field");

    const rejectedReorder = await app.request(
      `/api/project-field/reorder/${workspaceId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: [
            { id: source.id, position: 10 },
            { id: foreignField.id, position: 11 },
          ],
        }),
      },
    );
    expect(rejectedReorder.status).toBe(400);
    const [unchangedSource] = await db
      .select()
      .from(schema.workspaceCustomFieldDefinitionTable)
      .where(eq(schema.workspaceCustomFieldDefinitionTable.id, source.id));
    expect(unchangedSource?.position).toBe(1);

    const reorderedResponse = await app.request(
      `/api/project-field/reorder/${workspaceId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields: [
            { id: source.id, position: 2 },
            { id: formula.id, position: 1 },
          ],
        }),
      },
    );
    expect(reorderedResponse.status).toBe(200);
    expect(
      ((await reorderedResponse.json()) as Definition[]).map(
        (field) => field.id,
      ),
    ).toEqual([formula.id, source.id]);

    expect(
      (
        await app.request(`/api/project-field/${formula.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/project-field/${source.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(
      await db
        .select()
        .from(schema.projectCustomFieldValueTable)
        .where(eq(schema.projectCustomFieldValueTable.fieldId, source.id)),
    ).toEqual([]);
  });

  it("serializes concurrent names and positions", async () => {
    const { member, app } = await fixture();
    const workspaceId = member.workspace.id;
    const post = (name: string) =>
      app.request("/api/project-field", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, name, type: "text" }),
      });

    const sameName = await Promise.all([post("Customer"), post("Customer")]);
    expect(sameName.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);

    const distinct = await Promise.all([post("Owner"), post("Region")]);
    expect(distinct.map((response) => response.status)).toEqual([200, 200]);

    const fields = await db
      .select()
      .from(schema.workspaceCustomFieldDefinitionTable)
      .where(
        eq(schema.workspaceCustomFieldDefinitionTable.workspaceId, workspaceId),
      )
      .orderBy(asc(schema.workspaceCustomFieldDefinitionTable.position));
    expect(fields.map((field) => field.name).sort()).toEqual([
      "Customer",
      "Owner",
      "Region",
    ]);
    expect(fields.map((field) => field.position)).toEqual([1, 2, 3]);
  });
});
