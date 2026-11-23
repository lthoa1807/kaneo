import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectCustomFieldValueTable,
  projectTable,
  workspaceCustomFieldDefinitionTable,
} from "../../database/schema";
import { evaluateProjectFieldFormula } from "../formula";
import { toProjectFieldDefinition } from "../to-project-field-definition";
import type { ProjectFieldWithValue } from "../types";

export default async function getProjectFieldsByProject(
  projectId: string,
): Promise<ProjectFieldWithValue[]> {
  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const storedFields = await db
    .select()
    .from(workspaceCustomFieldDefinitionTable)
    .where(
      eq(workspaceCustomFieldDefinitionTable.workspaceId, project.workspaceId),
    )
    .orderBy(
      asc(workspaceCustomFieldDefinitionTable.position),
      asc(workspaceCustomFieldDefinitionTable.createdAt),
      asc(workspaceCustomFieldDefinitionTable.id),
    );

  const values =
    storedFields.length === 0
      ? []
      : await db
          .select({
            id: projectCustomFieldValueTable.id,
            fieldId: projectCustomFieldValueTable.fieldId,
            value: projectCustomFieldValueTable.value,
          })
          .from(projectCustomFieldValueTable)
          .where(
            and(
              eq(projectCustomFieldValueTable.projectId, projectId),
              inArray(
                projectCustomFieldValueTable.fieldId,
                storedFields.map((field) => field.id),
              ),
            ),
          );

  const byField = new Map(values.map((row) => [row.fieldId, row]));
  const storedValues = new Map(
    storedFields.map((field) => [
      field.id,
      byField.get(field.id)?.value ?? null,
    ]),
  );
  const definitions = storedFields.map(toProjectFieldDefinition);

  return definitions.map((definition) => {
    const row = byField.get(definition.id);
    return {
      ...definition,
      projectId,
      valueId: row?.id ?? null,
      value: row?.value ?? null,
      computedValue:
        definition.formula === null
          ? null
          : evaluateProjectFieldFormula(definition.formula, storedValues),
    };
  });
}
