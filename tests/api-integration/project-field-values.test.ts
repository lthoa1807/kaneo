import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
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

async function readValues(app: App, projectId: string) {
  const response = await app.request(`/api/project-field/project/${projectId}`);
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return JSON.parse(text) as Array<{
    id: string;
    type: string;
    value: string | null;
    valueId: string | null;
    computedValue: string | null;
  }>;
}

async function fixture() {
  const member = await createWorkspaceMember({ role: "admin" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const app = createApp().app;
  return { member, project, app, workspaceId: member.workspace.id };
}

describe("project field values", () => {
  it("stores, reads, and clears every stored type", async () => {
    const { app, project, workspaceId } = await fixture();

    const text = await createField(app, workspaceId, {
      name: "Customer",
      type: "text",
    });
    const longText = await createField(app, workspaceId, {
      name: "Notes",
      type: "long_text",
    });
    const number = await createField(app, workspaceId, {
      name: "Effort",
      type: "number",
    });
    const date = await createField(app, workspaceId, {
      name: "Go live",
      type: "date",
    });
    const dropdown = await createField(app, workspaceId, {
      name: "Stage",
      type: "dropdown",
      options: ["Planned", "Live"],
    });
    const multiselect = await createField(app, workspaceId, {
      name: "Products",
      type: "multiselect",
      options: ["Core", "Reports"],
    });
    const boolean = await createField(app, workspaceId, {
      name: "Warranty",
      type: "boolean",
    });

    const writes: Array<[Field, string]> = [
      [text, "  Acme  "],
      [longText, "line one\nline two"],
      [number, " 4.5 "],
      [date, "2026-02-28"],
      [dropdown, "Live"],
      [multiselect, '["Core","Reports","Core"]'],
      [boolean, "true"],
    ];

    for (const [field, value] of writes) {
      const response = await setValue(app, project.id, field.id, value);
      expect(response.status, await response.text()).toBe(200);
    }

    const values = await readValues(app, project.id);
    const byId = new Map(values.map((row) => [row.id, row]));
    expect(byId.get(text.id)?.value).toBe("  Acme  ");
    expect(byId.get(longText.id)?.value).toBe("line one\nline two");
    expect(byId.get(number.id)?.value).toBe("4.5");
    expect(byId.get(date.id)?.value).toBe("2026-02-28");
    expect(byId.get(dropdown.id)?.value).toBe("Live");
    expect(byId.get(multiselect.id)?.value).toBe('["Core","Reports"]');
    expect(byId.get(boolean.id)?.value).toBe("true");

    const cleared = await setValue(app, project.id, text.id, null);
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({
      projectId: project.id,
      fieldId: text.id,
      value: null,
    });

    const afterClear = await readValues(app, project.id);
    const clearedRow = afterClear.find((row) => row.id === text.id);
    expect(clearedRow).toMatchObject({ value: null, valueId: null });
  });

  it("computes formula values without storing a row", async () => {
    const { app, project, workspaceId } = await fixture();

    const start = await createField(app, workspaceId, {
      name: "Start",
      type: "date",
    });
    const end = await createField(app, workspaceId, {
      name: "End",
      type: "date",
    });
    const days = await createField(app, workspaceId, {
      name: "Days",
      type: "formula",
      formula: {
        kind: "date_diff",
        fromFieldId: start.id,
        toFieldId: end.id,
        unit: "day",
      },
    });
    const plusMonth = await createField(app, workspaceId, {
      name: "Review",
      type: "formula",
      formula: {
        kind: "date_add",
        fromFieldId: start.id,
        amount: 1,
        unit: "month",
      },
    });

    await setValue(app, project.id, start.id, "2028-01-31");
    await setValue(app, project.id, end.id, "2028-02-02");

    const values = await readValues(app, project.id);
    const byId = new Map(values.map((row) => [row.id, row]));
    expect(byId.get(days.id)).toMatchObject({
      value: null,
      valueId: null,
      computedValue: "2",
    });
    expect(byId.get(plusMonth.id)?.computedValue).toBe("2028-02-29");

    const rows = await db
      .select()
      .from(schema.projectCustomFieldValueTable)
      .where(
        and(
          eq(schema.projectCustomFieldValueTable.projectId, project.id),
          eq(schema.projectCustomFieldValueTable.fieldId, days.id),
        ),
      );
    expect(rows).toHaveLength(0);

    const rejected = await setValue(app, project.id, days.id, "5");
    expect(rejected.status).toBe(400);
  });

  it("rejects invalid values, required clears, and hidden picks", async () => {
    const { app, project, workspaceId } = await fixture();

    const number = await createField(app, workspaceId, {
      name: "Effort",
      type: "number",
    });
    const required = await createField(app, workspaceId, {
      name: "Owner",
      type: "text",
      required: true,
      defaultValue: "Unassigned",
    });
    const choice = await createField(app, workspaceId, {
      name: "Stage",
      type: "dropdown",
      options: ["Planned", "Live", "Retired"],
    });

    expect((await setValue(app, project.id, number.id, "abc")).status).toBe(
      400,
    );
    expect((await setValue(app, project.id, choice.id, "Unknown")).status).toBe(
      400,
    );
    expect((await setValue(app, project.id, required.id, " ")).status).toBe(
      400,
    );

    const hidden = await app.request(`/api/project-field/${choice.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hiddenOptions: ["Retired"] }),
    });
    expect(hidden.status).toBe(200);

    await setValue(app, project.id, choice.id, "Planned");
    expect((await setValue(app, project.id, choice.id, "Retired")).status).toBe(
      400,
    );
  });

  it("rejects a field from another workspace with 404", async () => {
    const { member, app, project } = await fixture();
    const other = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(other.user);
    const otherApp = createApp().app;
    const foreign = await createField(otherApp, other.workspace.id, {
      name: "Foreign",
      type: "text",
    });

    mockAuthenticatedSession(member.user);
    const response = await setValue(app, project.id, foreign.id, "value");
    expect(response.status).toBe(404);
  });
});
