import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import type db from "../database";
import {
  projectCustomFieldValueTable,
  projectTable,
  workspaceCustomFieldDefinitionTable,
} from "../database/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CHUNK_SIZE = 500;

export async function backfillProjectFieldDefault(
  tx: Transaction,
  input: { workspaceId: string; fieldId: string; value: string },
) {
  const projects = await tx
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(eq(projectTable.workspaceId, input.workspaceId));

  for (let offset = 0; offset < projects.length; offset += CHUNK_SIZE) {
    const chunk = projects.slice(offset, offset + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    await tx
      .insert(projectCustomFieldValueTable)
      .values(
        chunk.map((project) => ({
          projectId: project.id,
          fieldId: input.fieldId,
          value: input.value,
        })),
      )
      .onConflictDoNothing();
  }
}

// Turning a field required fills projects that have no usable value yet while
// leaving values someone already entered alone.
export async function fillEmptyProjectFieldValues(
  tx: Transaction,
  input: { workspaceId: string; fieldId: string; value: string },
) {
  await backfillProjectFieldDefault(tx, input);
  await tx
    .update(projectCustomFieldValueTable)
    .set({ value: input.value })
    .where(
      and(
        eq(projectCustomFieldValueTable.fieldId, input.fieldId),
        or(
          sql`${projectCustomFieldValueTable.value} is null`,
          sql`btrim(${projectCustomFieldValueTable.value}) in ('', '[]')`,
        ),
      ),
    );
}

export async function seedProjectFieldDefaults(
  tx: Transaction,
  input: { workspaceId: string; projectId: string },
) {
  const fields = await tx
    .select({
      id: workspaceCustomFieldDefinitionTable.id,
      defaultValue: workspaceCustomFieldDefinitionTable.defaultValue,
    })
    .from(workspaceCustomFieldDefinitionTable)
    .where(
      and(
        eq(workspaceCustomFieldDefinitionTable.workspaceId, input.workspaceId),
        isNotNull(workspaceCustomFieldDefinitionTable.defaultValue),
      ),
    );

  const seeded = fields.filter(
    (field) => field.defaultValue !== null && field.defaultValue.trim() !== "",
  );
  if (seeded.length === 0) return;

  await tx
    .insert(projectCustomFieldValueTable)
    .values(
      seeded.map((field) => ({
        projectId: input.projectId,
        fieldId: field.id,
        value: field.defaultValue as string,
      })),
    )
    .onConflictDoNothing();
}

// Every value a project has belongs to its current workspace's definitions, so
// a move clears them all before the project joins the destination workspace.
export async function deleteProjectFieldValuesForProject(
  tx: Transaction,
  projectId: string,
) {
  await tx
    .delete(projectCustomFieldValueTable)
    .where(eq(projectCustomFieldValueTable.projectId, projectId));
}
