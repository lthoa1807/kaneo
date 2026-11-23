import { asc, eq } from "drizzle-orm";
import db from "../../database";
import { workspaceCustomFieldDefinitionTable } from "../../database/schema";
import { toProjectFieldDefinition } from "../to-project-field-definition";

export default async function getProjectFieldsByWorkspace(workspaceId: string) {
  const fields = await db
    .select()
    .from(workspaceCustomFieldDefinitionTable)
    .where(eq(workspaceCustomFieldDefinitionTable.workspaceId, workspaceId))
    .orderBy(
      asc(workspaceCustomFieldDefinitionTable.position),
      asc(workspaceCustomFieldDefinitionTable.createdAt),
      asc(workspaceCustomFieldDefinitionTable.id),
    );
  return fields.map(toProjectFieldDefinition);
}
