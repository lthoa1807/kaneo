import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { publishEvent } from "../../events";
import {
  projectCustomFieldValueTable,
  projectTable,
  workspaceCustomFieldDefinitionTable,
} from "../../database/schema";
import { toProjectFieldDefinition } from "../to-project-field-definition";
import type { ProjectFieldValueInput } from "../types";
import { normalizeProjectFieldValue } from "../validate-project-field-value";
import type { ProjectFieldPublisher } from "./create-project-field";

export default async function setProjectFieldValue(
  { projectId, fieldId, value }: ProjectFieldValueInput,
  publish: ProjectFieldPublisher = publishEvent,
) {
  const result = await db.transaction(async (tx) => {
    // Lock the project row first: a concurrent move either waits for this write
    // (then clears it) or wins first and makes this source field stale (404).
    const [project] = await tx
      .select({ workspaceId: projectTable.workspaceId })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .limit(1)
      .for("update");
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const [storedField] = await tx
      .select()
      .from(workspaceCustomFieldDefinitionTable)
      .where(
        and(
          eq(workspaceCustomFieldDefinitionTable.id, fieldId),
          eq(
            workspaceCustomFieldDefinitionTable.workspaceId,
            project.workspaceId,
          ),
        ),
      )
      .limit(1);
    if (!storedField) {
      throw new HTTPException(404, { message: "Project field not found" });
    }

    const definition = toProjectFieldDefinition(storedField);
    const [current] = await tx
      .select({ value: projectCustomFieldValueTable.value })
      .from(projectCustomFieldValueTable)
      .where(
        and(
          eq(projectCustomFieldValueTable.projectId, projectId),
          eq(projectCustomFieldValueTable.fieldId, fieldId),
        ),
      )
      .limit(1);

    const normalized = normalizeProjectFieldValue(
      definition,
      value,
      current?.value ?? null,
    );

    if (normalized === null) {
      await tx
        .delete(projectCustomFieldValueTable)
        .where(
          and(
            eq(projectCustomFieldValueTable.projectId, projectId),
            eq(projectCustomFieldValueTable.fieldId, fieldId),
          ),
        );
      return {
        projectId,
        fieldId,
        value: null,
        workspaceId: project.workspaceId,
      };
    }

    const [written] = await tx
      .insert(projectCustomFieldValueTable)
      .values({ projectId, fieldId, value: normalized })
      .onConflictDoUpdate({
        target: [
          projectCustomFieldValueTable.projectId,
          projectCustomFieldValueTable.fieldId,
        ],
        set: { value: normalized },
      })
      .returning();

    return {
      projectId,
      fieldId,
      value: written?.value ?? null,
      workspaceId: project.workspaceId,
    };
  });

  // No project or field id on the wire: a restricted member in the workspace
  // must not learn that an inaccessible project changed.
  await publish("project-field.value_changed", {
    workspaceId: result.workspaceId,
  });
  return result;
}
