import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import db, { schema } from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

beforeEach(resetTestDatabase);

async function createFixture() {
  const member = await createWorkspaceMember({ role: "admin" });
  const [{ project: firstProject }, { project: secondProject }] =
    await Promise.all([
      createProjectFixture({
        workspaceId: member.workspace.id,
        name: "First project",
      }),
      createProjectFixture({
        workspaceId: member.workspace.id,
        name: "Second project",
      }),
    ]);

  const [customerField, goLiveField] = await db
    .insert(schema.workspaceCustomFieldDefinitionTable)
    .values([
      {
        workspaceId: member.workspace.id,
        name: "Customer",
        type: "text",
        position: 0,
      },
      {
        workspaceId: member.workspace.id,
        name: "Go live",
        type: "date",
        position: 1,
      },
    ])
    .returning();

  if (!customerField || !goLiveField) {
    throw new Error("Failed to create project field definitions");
  }

  return { member, firstProject, secondProject, customerField, goLiveField };
}

describe("project field storage", () => {
  it("stores workspace definitions and independent values for each project", async () => {
    const { member, firstProject, secondProject, customerField, goLiveField } =
      await createFixture();

    const [firstValue, secondValue] = await db
      .insert(schema.projectCustomFieldValueTable)
      .values([
        {
          projectId: firstProject.id,
          fieldId: customerField.id,
          value: "Acme",
        },
        {
          projectId: secondProject.id,
          fieldId: goLiveField.id,
          value: "2026-12-01",
        },
      ])
      .returning();

    expect(customerField.workspaceId).toBe(member.workspace.id);
    expect(firstValue).toMatchObject({
      projectId: firstProject.id,
      fieldId: customerField.id,
      value: "Acme",
    });
    expect(secondValue).toMatchObject({
      projectId: secondProject.id,
      fieldId: goLiveField.id,
      value: "2026-12-01",
    });
  });

  it("rejects duplicate field names and duplicate project-field values", async () => {
    const { member, firstProject, customerField } = await createFixture();

    await db.insert(schema.projectCustomFieldValueTable).values({
      projectId: firstProject.id,
      fieldId: customerField.id,
      value: "Acme",
    });

    await expect(
      db.insert(schema.workspaceCustomFieldDefinitionTable).values({
        workspaceId: member.workspace.id,
        name: customerField.name,
        type: "text",
        position: 2,
      }),
    ).rejects.toBeDefined();

    await expect(
      db.insert(schema.projectCustomFieldValueTable).values({
        projectId: firstProject.id,
        fieldId: customerField.id,
        value: "Duplicate",
      }),
    ).rejects.toBeDefined();
  });

  it("cascades only values owned by a deleted definition or project", async () => {
    const { firstProject, secondProject, customerField, goLiveField } =
      await createFixture();

    await db.insert(schema.projectCustomFieldValueTable).values([
      {
        projectId: firstProject.id,
        fieldId: customerField.id,
        value: "Acme",
      },
      {
        projectId: secondProject.id,
        fieldId: goLiveField.id,
        value: "2026-12-01",
      },
    ]);

    await db
      .delete(schema.workspaceCustomFieldDefinitionTable)
      .where(
        eq(schema.workspaceCustomFieldDefinitionTable.id, customerField.id),
      );

    const afterDefinitionDelete = await db
      .select()
      .from(schema.projectCustomFieldValueTable);

    expect(afterDefinitionDelete).toHaveLength(1);
    expect(afterDefinitionDelete[0]).toMatchObject({
      projectId: secondProject.id,
      fieldId: goLiveField.id,
    });

    await db
      .delete(schema.projectTable)
      .where(eq(schema.projectTable.id, secondProject.id));

    const remainingValues = await db
      .select()
      .from(schema.projectCustomFieldValueTable)
      .where(
        and(
          eq(schema.projectCustomFieldValueTable.projectId, secondProject.id),
          eq(schema.projectCustomFieldValueTable.fieldId, goLiveField.id),
        ),
      );

    expect(remainingValues).toEqual([]);
  });
});
