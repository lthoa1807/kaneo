import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { publishEvent } from "../../events";
import { workspaceCustomFieldDefinitionTable } from "../../database/schema";
import { lockProjectOrdering } from "../../project/controllers/project-placement";
import { toProjectFieldDefinition } from "../to-project-field-definition";
import type { ProjectFieldPublisher } from "./create-project-field";

export default async function reorderProjectFields(
  workspaceId: string,
  fields: Array<{ id: string; position: number }>,
  publish: ProjectFieldPublisher = publishEvent,
) {
  const reorderedFields = await db.transaction(async (tx) => {
    await lockProjectOrdering(tx, workspaceId);

    const ids = fields.map((field) => field.id);
    if (new Set(ids).size !== ids.length) {
      throw new HTTPException(400, {
        message: "Duplicate project field ids in reorder payload",
      });
    }

    const existing = await tx
      .select({ id: workspaceCustomFieldDefinitionTable.id })
      .from(workspaceCustomFieldDefinitionTable)
      .where(eq(workspaceCustomFieldDefinitionTable.workspaceId, workspaceId));
    const owned = new Set(existing.map((field) => field.id));
    const foreign = ids.find((id) => !owned.has(id));
    if (foreign) {
      throw new HTTPException(400, {
        message: `Project field ${foreign} does not belong to this workspace`,
      });
    }

    for (const field of fields) {
      await tx
        .update(workspaceCustomFieldDefinitionTable)
        .set({ position: field.position })
        .where(eq(workspaceCustomFieldDefinitionTable.id, field.id));
    }

    const reordered = await tx
      .select()
      .from(workspaceCustomFieldDefinitionTable)
      .where(eq(workspaceCustomFieldDefinitionTable.workspaceId, workspaceId))
      .orderBy(
        asc(workspaceCustomFieldDefinitionTable.position),
        asc(workspaceCustomFieldDefinitionTable.createdAt),
        asc(workspaceCustomFieldDefinitionTable.id),
      );
    return reordered.map(toProjectFieldDefinition);
  });

  // The whole ordered set changed, and ids would leak nothing useful to the
  // client, which refetches the workspace definitions anyway.
  await publish("project-field.definition_changed", { workspaceId });
  return reorderedFields;
}
