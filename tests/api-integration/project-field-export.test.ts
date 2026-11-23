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
import { createRestrictedWorkspace } from "./helpers/project-access/create-restricted-workspace";
import { projectAccessApi } from "./helpers/project-access/project-access-api";

type App = ReturnType<typeof createApp>["app"];

beforeEach(resetTestDatabase);

async function createField(
  app: App,
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
  return JSON.parse(text) as { id: string; name: string };
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

async function exportCsv(
  app: App,
  workspaceId: string,
  params: Record<string, string> = {},
) {
  const search = new URLSearchParams(params);
  const response = await app.request(
    `/api/project-field/table/${workspaceId}/export?${search.toString()}`,
  );
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    await response.arrayBuffer(),
  );
  return { response, text };
}

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
  const stage = await createField(app, workspaceId, {
    name: "Stage",
    type: "dropdown",
    options: ["Planned", "Live"],
  });
  await setValue(app, alpha.project.id, customer.id, 'Acme "North"');
  await setValue(app, alpha.project.id, stage.id, "Live");
  await setValue(app, beta.project.id, customer.id, "Beta");
  await setValue(app, beta.project.id, stage.id, "Planned");

  return { member, app, workspaceId, alpha, beta, customer, stage };
}

describe("project field CSV export", () => {
  it("returns a UTF-8 attachment with a BOM and a Project header", async () => {
    const { app, workspaceId } = await fixture();
    const { response, text } = await exportCsv(app, workspaceId);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="projects-${workspaceId}.csv"`,
    );
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text.split("\r\n")[0]).toBe('\uFEFF"Project","Customer","Stage"');
    expect(text).toContain('"Acme ""North"""');
    expect(text).toContain('"Beta","Beta","Planned"');
  });

  it("respects filters, sort, archived projects, and selected columns", async () => {
    const { app, workspaceId, customer, stage, beta } = await fixture();

    const filtered = await exportCsv(app, workspaceId, {
      filters: JSON.stringify([
        { fieldId: stage.id, operator: "eq", value: "Live" },
      ]),
      columns: `${stage.id},${customer.id}`,
    });
    expect(filtered.response.status).toBe(200);
    expect(filtered.text.split("\r\n")[0]).toBe(
      '\uFEFF"Project","Customer","Stage"',
    );
    expect(filtered.text).toContain('"Alpha"');
    expect(filtered.text).not.toContain('"Beta"');

    const sorted = await exportCsv(app, workspaceId, {
      sort: JSON.stringify([{ key: "name", direction: "desc" }]),
    });
    expect(sorted.text.indexOf('"Beta"')).toBeLessThan(
      sorted.text.indexOf('"Alpha"'),
    );

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, beta.project.id));

    const active = await exportCsv(app, workspaceId);
    expect(active.text).not.toContain('"Beta"');
    const archived = await exportCsv(app, workspaceId, {
      includeArchived: "true",
    });
    expect(archived.text).toContain('"Beta"');
  });

  it("exports only the Project column when columns is empty and de-duplicates ids", async () => {
    const { app, workspaceId, customer } = await fixture();

    const empty = await exportCsv(app, workspaceId, { columns: "" });
    expect(empty.text.split("\r\n")[0]).toBe('\uFEFF"Project"');

    const repeated = await exportCsv(app, workspaceId, {
      columns: `${customer.id},${customer.id}`,
    });
    expect(repeated.text.split("\r\n")[0]).toBe('\uFEFF"Project","Customer"');
  });

  it("rejects unknown columns and accepts formula columns", async () => {
    const { app, workspaceId, customer } = await fixture();

    const unknown = await exportCsv(app, workspaceId, {
      columns: "unknown",
    });
    expect(unknown.response.status).toBe(400);

    const effort = await createField(app, workspaceId, {
      name: "Effort",
      type: "number",
    });
    const formula = await createField(app, workspaceId, {
      name: "Difference",
      type: "formula",
      formula: {
        kind: "number",
        op: "subtract",
        leftFieldId: effort.id,
        rightFieldId: effort.id,
      },
    });
    const included = await exportCsv(app, workspaceId, {
      columns: formula.id,
      filters: JSON.stringify([{ fieldId: customer.id, operator: "notEmpty" }]),
    });
    expect(included.response.status).toBe(200);
    expect(included.text.split("\r\n")[0]).toBe('\uFEFF"Project","Difference"');
  });

  it("exports only accessible projects", async () => {
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
    const response = await projectAccessApi()(
      `/project-field/table/${ctx.workspace.id}/export`,
    );
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
      await response.arrayBuffer(),
    );
    expect(response.status).toBe(200);
    expect(text).toContain("Alpha");
    expect(text).not.toContain("Beta");
  });
});
