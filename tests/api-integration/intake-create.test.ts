import { beforeEach, describe, expect, it } from "vite-plus/test";
import { eq } from "drizzle-orm";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { restrictToProjects } from "./helpers/project-access/restrict-to-projects";

beforeEach(resetTestDatabase);

async function enableIntake(projectId: string) {
  await db
    .update(schema.projectTable)
    .set({ intakeEnabled: true })
    .where(eq(schema.projectTable.id, projectId));
}

function postIntakeRequest(workspaceId: string, body: unknown) {
  return createApp().app.request(
    `/api/intake/workspaces/${workspaceId}/intake-requests`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("intake request creation", () => {
  it("creates a request with REQ numbering and a created activity row", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await enableIntake(project.id);
    mockAuthenticatedSession(member.user);

    const response = await postIntakeRequest(member.workspace.id, {
      projectId: project.id,
      title: "Fix login",
      description: "It 404s",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.number).toBe(1);
    expect(body.displayId).toBe("REQ-1");
    expect(body.status).toBe("new");
    expect(body.createdById).toBe(member.user.id);
    expect(body.projectName).toBe(project.name);

    const second = await (
      await postIntakeRequest(member.workspace.id, {
        projectId: project.id,
        title: "Second",
      })
    ).json();
    expect(second.number).toBe(2);
    expect(second.displayId).toBe("REQ-2");

    const activities = await db.select().from(schema.intakeActivityTable);
    expect(activities).toHaveLength(2);
    expect(activities.every((a) => a.type === "created")).toBe(true);
    expect(activities.every((a) => a.userId === member.user.id)).toBe(true);
  });

  it("rejects creation in a project without intake enabled", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    mockAuthenticatedSession(member.user);

    const response = await postIntakeRequest(member.workspace.id, {
      projectId: project.id,
      title: "X",
    });
    expect(response.status).toBe(403);
  });

  it("rejects creation in a project the actor cannot access", async () => {
    const member = await createWorkspaceMember();
    const alpha = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Alpha",
    });
    const beta = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Beta",
    });
    await enableIntake(beta.project.id);
    await restrictToProjects(member.workspace.id, member.user.id, [
      alpha.project.id,
    ]);
    mockAuthenticatedSession(member.user);

    const response = await postIntakeRequest(member.workspace.id, {
      projectId: beta.project.id,
      title: "X",
    });
    expect(response.status).toBe(403);
  });

  it("enforces the intakeRequest:create permission", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    const { project } = await createProjectFixture({
      workspaceId: viewer.workspace.id,
    });
    await enableIntake(project.id);
    mockAuthenticatedSession(viewer.user);

    const response = await postIntakeRequest(viewer.workspace.id, {
      projectId: project.id,
      title: "X",
    });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("MISSING_PERMISSION");
  });
});

describe("intake project picker", () => {
  it("lists only intake-enabled projects the actor can access", async () => {
    const guest = await createWorkspaceMember({ role: "guest" });
    const alpha = await createProjectFixture({
      workspaceId: guest.workspace.id,
      name: "Alpha",
    });
    const beta = await createProjectFixture({
      workspaceId: guest.workspace.id,
      name: "Beta",
    });
    const gamma = await createProjectFixture({
      workspaceId: guest.workspace.id,
      name: "Gamma",
    });
    await enableIntake(alpha.project.id);
    await enableIntake(gamma.project.id);
    await restrictToProjects(guest.workspace.id, guest.user.id, [
      alpha.project.id,
      beta.project.id,
    ]);
    mockAuthenticatedSession(guest.user);

    const response = await createApp().app.request(
      `/api/intake/workspaces/${guest.workspace.id}/intake-projects`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([{ id: alpha.project.id, name: "Alpha" }]);
  });

  it("requires intakeRequest:create", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    mockAuthenticatedSession(viewer.user);

    const response = await createApp().app.request(
      `/api/intake/workspaces/${viewer.workspace.id}/intake-projects`,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("MISSING_PERMISSION");
  });
});
