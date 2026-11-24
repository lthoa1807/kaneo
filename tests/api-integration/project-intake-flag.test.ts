import { beforeEach, describe, expect, it } from "vite-plus/test";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const { app } = createApp();

beforeEach(resetTestDatabase);

async function workspaceWithProject() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    name: "Portal",
    slug: "portal",
  });
  return { owner, project };
}

function updateProjectRequest(projectId: string, intakeEnabled: boolean) {
  return app.request(`/api/project/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Portal",
      icon: "Layout",
      slug: "portal",
      description: "",
      isPublic: false,
      intakeEnabled,
    }),
  });
}

describe("project intake flag", () => {
  it("is off by default", async () => {
    const ctx = await workspaceWithProject();
    mockAuthenticatedSession(ctx.owner.user);

    const response = await app.request(`/api/project/${ctx.project.id}`);
    expect(response.status).toBe(200);
    const project = (await response.json()) as { intakeEnabled: boolean };
    expect(project.intakeEnabled).toBe(false);
  });

  it("can be turned on and off through the project update", async () => {
    const ctx = await workspaceWithProject();
    mockAuthenticatedSession(ctx.owner.user);

    const enabled = await updateProjectRequest(ctx.project.id, true);
    expect(enabled.status).toBe(200);
    expect(
      ((await enabled.json()) as { intakeEnabled: boolean }).intakeEnabled,
    ).toBe(true);

    const readBack = await app.request(`/api/project/${ctx.project.id}`);
    expect(
      ((await readBack.json()) as { intakeEnabled: boolean }).intakeEnabled,
    ).toBe(true);

    // The project settings screen reads the board payload, not the project one.
    const board = await app.request(`/api/task/tasks/${ctx.project.id}`);
    expect(board.status).toBe(200);
    const boardProject = (
      (await board.json()) as {
        data: { intakeEnabled: boolean };
      }
    ).data;
    expect(boardProject.intakeEnabled).toBe(true);

    const disabled = await updateProjectRequest(ctx.project.id, false);
    expect(
      ((await disabled.json()) as { intakeEnabled: boolean }).intakeEnabled,
    ).toBe(false);
  });
});
