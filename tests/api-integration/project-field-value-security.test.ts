import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { addWorkspaceMember } from "./helpers/project-access/add-workspace-member";
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

describe("project field value security", () => {
  it("lets workspace viewers read values but not write them", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;
    const field = await createField(ownerApp, owner.workspace.id, {
      name: "Customer",
      type: "text",
      defaultValue: "Acme",
    });

    const viewer = await addWorkspaceMember(owner.workspace.id, "viewer");
    mockAuthenticatedSession(viewer);
    const app = createApp().app;

    const read = await app.request(`/api/project-field/project/${project.id}`);
    expect(read.status).toBe(200);
    expect(await read.json()).toContainEqual(
      expect.objectContaining({ id: field.id, value: "Acme" }),
    );

    const write = await app.request(
      `/api/project-field/project/${project.id}/value`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fieldId: field.id, value: "Other" }),
      },
    );
    expect(write.status).toBe(403);
  });

  it("hides values for projects outside a restricted member's selection", async () => {
    const ctx = await createRestrictedWorkspace();
    mockAuthenticatedSession(ctx.owner);
    const ownerApp = createApp().app;
    const field = await createField(ownerApp, ctx.workspace.id, {
      name: "Customer",
      type: "text",
      defaultValue: "Acme",
    });

    mockAuthenticatedSession(ctx.restricted);
    const request = projectAccessApi();

    const visible = await request(`/project-field/project/${ctx.alpha.id}`);
    expect(visible.status).toBe(200);
    expect(await visible.json()).toContainEqual(
      expect.objectContaining({ id: field.id, value: "Acme" }),
    );

    expect(
      (await request(`/project-field/project/${ctx.beta.id}`)).status,
    ).toBe(403);

    const rejected = await request(
      `/project-field/project/${ctx.beta.id}/value`,
      {
        method: "PUT",
        body: { fieldId: field.id, value: "Beta" },
      },
    );
    expect(rejected.status).toBe(403);
  });

  it("returns 404 for a project in another workspace and for task-field ids", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    mockAuthenticatedSession(owner.user);
    const app = createApp().app;
    const field = await createField(app, owner.workspace.id, {
      name: "Customer",
      type: "text",
    });

    const foreign = await createWorkspaceMember({ role: "owner" });
    const foreignProject = await createProjectFixture({
      workspaceId: foreign.workspace.id,
    });
    const foreignRead = await app.request(
      `/api/project-field/project/${foreignProject.project.id}`,
    );
    expect(foreignRead.status).toBe(404);

    const foreignWrite = await app.request(
      `/api/project-field/project/${foreignProject.project.id}/value`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fieldId: field.id, value: "Acme" }),
      },
    );
    expect(foreignWrite.status).toBe(404);

    const taskFieldWrite = await app.request(`/api/custom-field/${field.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Renamed ${randomUUID()}` }),
    });
    expect(taskFieldWrite.status).toBe(404);
  });
});
