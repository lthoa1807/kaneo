import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { publishEvent } from "../../events";
import { workspaceCustomFieldDefinitionTable } from "../../database/schema";
import { ApiError } from "../../errors/api-error";
import { lockProjectOrdering } from "../../project/controllers/project-placement";
import { findDependentProjectFields } from "../definition-rules";
import { toProjectFieldDefinition } from "../to-project-field-definition";
import type { ProjectFieldPublisher } from "./create-project-field";

export default async function deleteProjectField(
  id: string,
  publish: ProjectFieldPublisher = publishEvent,
) {
  const field = await db.transaction(async (tx) => {
    const [scope] = await tx
      .select({ workspaceId: workspaceCustomFieldDefinitionTable.workspaceId })
      .from(workspaceCustomFieldDefinitionTable)
      .where(eq(workspaceCustomFieldDefinitionTable.id, id))
      .limit(1);
    if (!scope) {
      throw new HTTPException(404, { message: "Project field not found" });
    }

    await lockProjectOrdering(tx, scope.workspaceId);
    const [current] = await tx
      .select()
      .from(workspaceCustomFieldDefinitionTable)
      .where(eq(workspaceCustomFieldDefinitionTable.id, id))
      .limit(1)
      .for("update");
    if (!current) {
      throw new HTTPException(404, { message: "Project field not found" });
    }

    const dependents = await findDependentProjectFields(
      tx,
      current.workspaceId,
      id,
    );
    if (dependents.length > 0) {
      throw new ApiError(409, {
        code: "PROJECT_FIELD_IN_USE",
        message: "Update or delete dependent formulas first",
        issues: dependents.map((dependent) => ({
          path: dependent.id,
          message: dependent.name,
        })),
      });
    }

    const [deleted] = await tx
      .delete(workspaceCustomFieldDefinitionTable)
      .where(eq(workspaceCustomFieldDefinitionTable.id, id))
      .returning();
    if (!deleted) {
      throw new HTTPException(404, { message: "Project field not found" });
    }
    return deleted;
  });
  await publish("project-field.definition_changed", {
    workspaceId: field.workspaceId,
  });
  return toProjectFieldDefinition(field);
}
