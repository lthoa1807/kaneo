import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  projectCustomFieldValueTable,
  projectTable,
  workspaceCustomFieldDefinitionTable,
} from "../../database/schema";
import { findDependentProjectFields } from "../definition-rules";

export default async function getProjectFieldUsage(id: string) {
  return db.transaction(async (tx) => {
    const [field] = await tx
      .select({ workspaceId: workspaceCustomFieldDefinitionTable.workspaceId })
      .from(workspaceCustomFieldDefinitionTable)
      .where(eq(workspaceCustomFieldDefinitionTable.id, id))
      .limit(1);
    if (!field) {
      throw new HTTPException(404, { message: "Project field not found" });
    }

    const [projects = { count: 0 }] = await tx
      .select({ count: count() })
      .from(projectTable)
      .where(eq(projectTable.workspaceId, field.workspaceId));
    const [values = { count: 0 }] = await tx
      .select({ count: count() })
      .from(projectCustomFieldValueTable)
      .where(
        and(
          eq(projectCustomFieldValueTable.fieldId, id),
          isNotNull(projectCustomFieldValueTable.value),
          sql`btrim(${projectCustomFieldValueTable.value}) <> ''`,
          sql`${projectCustomFieldValueTable.value} <> '[]'`,
        ),
      );
    const dependentFormulas = await findDependentProjectFields(
      tx,
      field.workspaceId,
      id,
    );

    return {
      projectCount: projects.count,
      valueCount: values.count,
      dependentFormulaCount: dependentFormulas.length,
      dependentFormulas,
    };
  });
}
