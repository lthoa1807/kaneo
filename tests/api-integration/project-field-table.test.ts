import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { createTaskFixture } from "./helpers/project-access/create-task-fixture";

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
  const response = await app.request(
    `/api/project-field/project/${projectId}/value`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fieldId, value }),
    },
  );
  expect(response.status, await response.text()).toBe(200);
}

async function table(
  app: App,
  workspaceId: string,
  params: Record<string, string | number | undefined> = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const response = await app.request(
    `/api/project-field/table/${workspaceId}?${search.toString()}`,
  );
  const text = await response.text();
  return { response, text };
}

type TableBody = {
  definitions: Array<{ id: string; name: string }>;
  projects: Array<{
    id: string;
    name: string;
    values: Record<string, string | null>;
    formulas: Record<string, string | null>;
    statistics: { totalTasks: number; completionPercentage: number };
  }>;
  total: number;
};

async function fixture() {
  const member = await createWorkspaceMember({ role: "owner" });
  const alpha = await createProjectFixture({
    workspaceId: member.workspace.id,
    name: "Alpha",
  });
  const beta = await createProjectFixture({
    workspaceId: member.workspace.id,
    name: "Beta",
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  const workspaceId = member.workspace.id;

  const customer = await createField(app, workspaceId, {
    name: "Customer",
    type: "text",
  });
  const effort = await createField(app, workspaceId, {
    name: "Effort",
    type: "number",
  });
  const goLive = await createField(app, workspaceId, {
    name: "Go live",
    type: "date",
  });
  const stage = await createField(app, workspaceId, {
    name: "Stage",
    type: "dropdown",
    options: ["Planned", "Live"],
  });
  const products = await createField(app, workspaceId, {
    name: "Products",
    type: "multiselect",
    options: ["Core", "Reports", "Extra"],
  });
  const warranty = await createField(app, workspaceId, {
    name: "Warranty",
    type: "boolean",
  });
  const days = await createField(app, workspaceId, {
    name: "Days",
    type: "formula",
    formula: {
      kind: "date_diff",
      fromFieldId: goLive.id,
      toFieldId: goLive.id,
      unit: "day",
    },
  });

  await setValue(app, alpha.project.id, customer.id, "Acme 100%_Corp");
  await setValue(app, alpha.project.id, effort.id, "10");
  await setValue(app, alpha.project.id, goLive.id, "2026-01-01");
  await setValue(app, alpha.project.id, stage.id, "Live");
  await setValue(app, alpha.project.id, products.id, '["Core","Reports"]');
  await setValue(app, alpha.project.id, warranty.id, "true");

  await setValue(app, beta.project.id, customer.id, "beta");
  await setValue(app, beta.project.id, effort.id, "2");
  await setValue(app, beta.project.id, stage.id, "Planned");
  await setValue(app, beta.project.id, products.id, '["Extra"]');
  await setValue(app, beta.project.id, warranty.id, "false");

  return {
    member,
    app,
    workspaceId,
    alpha,
    beta,
    fields: { customer, effort, goLive, stage, products, warranty, days },
  };
}

describe("project field table", () => {
  it("returns definitions, values, formulas, statistics, and total", async () => {
    const { member, app, workspaceId, alpha, fields } = await fixture();
    await createTaskFixture(alpha, "Task one", member.user.id);

    const { response, text } = await table(app, workspaceId);
    expect(response.status, text).toBe(200);
    const body = JSON.parse(text) as TableBody;

    expect(body.definitions.map((field) => field.name)).toEqual([
      "Customer",
      "Effort",
      "Go live",
      "Stage",
      "Products",
      "Warranty",
      "Days",
    ]);
    expect(body.total).toBe(2);
    expect(body.projects.map((project) => project.name)).toEqual([
      "Alpha",
      "Beta",
    ]);

    const first = body.projects[0];
    expect(first.values[fields.customer.id]).toBe("Acme 100%_Corp");
    expect(first.values[fields.stage.id]).toBe("Live");
    expect(first.formulas[fields.days.id]).toBe("0");
    expect(first.statistics.totalTasks).toBe(1);
  });

  it("filters by text, number, date, choice, multiselect, and boolean", async () => {
    const { app, workspaceId, fields } = await fixture();

    async function ids(params: Record<string, unknown>) {
      const { response, text } = await table(app, workspaceId, {
        filters: JSON.stringify(params),
      });
      expect(response.status, text).toBe(200);
      return (JSON.parse(text) as TableBody).projects.map((p) => p.name);
    }

    expect(
      await ids([
        { fieldId: fields.customer.id, operator: "contains", value: "100%_" },
      ]),
    ).toEqual(["Alpha"]);
    expect(
      await ids([
        { fieldId: fields.customer.id, operator: "startsWith", value: "BETA" },
      ]),
    ).toEqual(["Beta"]);
    expect(
      await ids([{ fieldId: fields.effort.id, operator: "gt", value: "5" }]),
    ).toEqual(["Alpha"]);
    expect(
      await ids([
        { fieldId: fields.goLive.id, operator: "gte", value: "2026-02-01" },
      ]),
    ).toEqual([]);
    expect(
      await ids([
        { fieldId: fields.stage.id, operator: "in", value: ["Planned"] },
      ]),
    ).toEqual(["Beta"]);
    expect(
      await ids([
        { fieldId: fields.products.id, operator: "in", value: ["Extra"] },
      ]),
    ).toEqual(["Beta"]);
    expect(
      await ids([
        { fieldId: fields.warranty.id, operator: "eq", value: "false" },
      ]),
    ).toEqual(["Beta"]);

    // Missing values only match `empty`; `neq` requires a stored value.
    expect(
      await ids([{ fieldId: fields.goLive.id, operator: "empty" }]),
    ).toEqual(["Beta"]);
    expect(
      await ids([
        { fieldId: fields.goLive.id, operator: "neq", value: "2026-01-01" },
      ]),
    ).toEqual([]);
    expect(
      await ids([{ fieldId: fields.effort.id, operator: "notEmpty" }]),
    ).toEqual(["Alpha", "Beta"]);
  });

  it("sorts by two keys with nulls last and deterministic fallbacks", async () => {
    const { app, workspaceId, fields } = await fixture();

    const desc = await table(app, workspaceId, {
      sort: JSON.stringify([{ key: fields.effort.id, direction: "desc" }]),
    });
    expect(desc.response.status).toBe(200);
    expect(
      (JSON.parse(desc.text) as TableBody).projects.map(
        (project) => project.name,
      ),
    ).toEqual(["Alpha", "Beta"]);

    const asc = await table(app, workspaceId, {
      sort: JSON.stringify([
        { key: fields.goLive.id, direction: "asc" },
        { key: "name", direction: "desc" },
      ]),
    });
    expect(asc.response.status).toBe(200);
    // The project without a date sorts last in both directions.
    expect(
      (JSON.parse(asc.text) as TableBody).projects.map(
        (project) => project.name,
      ),
    ).toEqual(["Alpha", "Beta"]);

    const missingDesc = await table(app, workspaceId, {
      sort: JSON.stringify([{ key: fields.goLive.id, direction: "desc" }]),
    });
    expect(
      (JSON.parse(missingDesc.text) as TableBody).projects.map((p) => p.name),
    ).toEqual(["Alpha", "Beta"]);
  });

  it("paginates and toggles archived projects", async () => {
    const { app, workspaceId, beta } = await fixture();
    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, beta.project.id));

    const active = await table(app, workspaceId);
    expect((JSON.parse(active.text) as TableBody).total).toBe(1);

    const all = await table(app, workspaceId, { includeArchived: "true" });
    expect((JSON.parse(all.text) as TableBody).total).toBe(2);

    const page = await table(app, workspaceId, {
      limit: 1,
      offset: 1,
      includeArchived: "true",
    });
    const body = JSON.parse(page.text) as TableBody;
    expect(body.total).toBe(2);
    expect(body.projects.map((project) => project.name)).toEqual(["Beta"]);
  });

  it("rejects malformed, oversized, and foreign queries", async () => {
    const { member, app, workspaceId, fields } = await fixture();
    const foreign = await createWorkspaceMember({ role: "owner" });
    const foreignApp = createApp().app;
    mockAuthenticatedSession(foreign.user);
    const foreignField = await createField(foreignApp, foreign.workspace.id, {
      name: "Foreign",
      type: "text",
    });
    mockAuthenticatedSession(member.user);

    const cases: Array<Record<string, string | number>> = [
      { filters: "{not-json" },
      { sort: "nope" },
      {
        filters: JSON.stringify([
          { fieldId: fields.customer.id, operator: "bogus" },
        ]),
      },
      {
        filters: JSON.stringify([
          { fieldId: fields.customer.id, operator: "in", value: [] },
        ]),
      },
      {
        filters: JSON.stringify([
          { fieldId: fields.customer.id, operator: "eq", value: ["a"] },
        ]),
      },
      {
        filters: JSON.stringify([
          { fieldId: fields.days.id, operator: "eq", value: "1" },
        ]),
      },
      {
        filters: JSON.stringify([
          { fieldId: foreignField.id, operator: "eq", value: "a" },
        ]),
      },
      { sort: JSON.stringify([{ key: fields.days.id, direction: "asc" }]) },
      { sort: JSON.stringify([{ key: "name", direction: "sideways" }]) },
      {
        sort: JSON.stringify([
          { key: "name", direction: "asc" },
          { key: "createdAt", direction: "asc" },
          { key: "position", direction: "asc" },
        ]),
      },
      { limit: 201 },
      {
        filters: JSON.stringify(
          Array.from({ length: 21 }, () => ({
            fieldId: fields.customer.id,
            operator: "empty",
          })),
        ),
      },
      { filters: JSON.stringify({ padding: "x".repeat(17_000) }) },
    ];

    for (const params of cases) {
      const { response } = await table(app, workspaceId, params);
      expect({ params, status: response.status }).toMatchObject({
        status: 400,
      });
    }
  });

  it("tolerates malformed stored values", async () => {
    const { app, workspaceId, alpha, fields } = await fixture();
    await db
      .insert(schema.projectCustomFieldValueTable)
      .values([
        {
          projectId: alpha.project.id,
          fieldId: fields.goLive.id,
          value: "not-a-date",
        },
      ])
      .onConflictDoUpdate({
        target: [
          schema.projectCustomFieldValueTable.projectId,
          schema.projectCustomFieldValueTable.fieldId,
        ],
        set: { value: "not-a-date" },
      });

    const plain = await table(app, workspaceId, {
      sort: JSON.stringify([{ key: fields.goLive.id, direction: "asc" }]),
    });
    expect(plain.response.status).toBe(200);

    const filtered = await table(app, workspaceId, {
      filters: JSON.stringify([
        { fieldId: fields.goLive.id, operator: "gte", value: "2020-01-01" },
      ]),
    });
    expect(filtered.response.status).toBe(200);
    expect((JSON.parse(filtered.text) as TableBody).projects).toEqual([]);
  });
});
