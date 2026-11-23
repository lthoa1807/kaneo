import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { publishEvent } from "../../events";
import {
  projectCustomFieldValueTable,
  workspaceCustomFieldDefinitionTable,
} from "../../database/schema";
import { isChoiceType, readOptions } from "../../custom-field/choice-options";
import { planChoiceValueChanges } from "../../custom-field/plan-choice-value-changes";
import { lockProjectOrdering } from "../../project/controllers/project-placement";
import {
  assertValidProjectFieldDefinition,
  isProjectFieldNameConflict,
  resolveProjectFieldUpdate,
} from "../definition-rules";
import { fillEmptyProjectFieldValues } from "../project-field-defaults";
import { toProjectFieldDefinition } from "../to-project-field-definition";
import type { ProjectFieldUpdateInput } from "../types";
import type { ProjectFieldPublisher } from "./create-project-field";

export default async function updateProjectField(
  id: string,
  input: ProjectFieldUpdateInput,
  publish: ProjectFieldPublisher = publishEvent,
) {
  try {
    const field = await db.transaction(async (tx) => {
      const [scope] = await tx
        .select({
          workspaceId: workspaceCustomFieldDefinitionTable.workspaceId,
        })
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

      const resolved = resolveProjectFieldUpdate(current, input);
      await assertValidProjectFieldDefinition(
        tx,
        current.workspaceId,
        resolved,
      );

      if (
        isChoiceType(current.type) &&
        isChoiceType(resolved.type) &&
        (resolved.type !== current.type ||
          readOptions(current.options).some(
            (option) => !(resolved.options ?? []).includes(option),
          ))
      ) {
        const rows = await tx
          .selectDistinct({ value: projectCustomFieldValueTable.value })
          .from(projectCustomFieldValueTable)
          .where(eq(projectCustomFieldValueTable.fieldId, id));

        const changes = planChoiceValueChanges({
          values: rows.map((row) => row.value),
          from: current.type,
          to: resolved.type,
          removedOptions: readOptions(current.options).filter(
            (option) => !(resolved.options ?? []).includes(option),
          ),
          entityLabel: "projects",
        });

        if (changes.length > 0) {
          const cases = sql.join(
            changes.map((change) => sql`when ${change.from} then ${change.to}`),
            sql` `,
          );
          await tx
            .update(projectCustomFieldValueTable)
            .set({
              value: sql`case ${projectCustomFieldValueTable.value} ${cases} end`,
            })
            .where(
              and(
                eq(projectCustomFieldValueTable.fieldId, id),
                inArray(
                  projectCustomFieldValueTable.value,
                  changes.map((change) => change.from),
                ),
              ),
            );
        }
      }

      const [updated] = await tx
        .update(workspaceCustomFieldDefinitionTable)
        .set(resolved)
        .where(eq(workspaceCustomFieldDefinitionTable.id, id))
        .returning();
      if (!updated) {
        throw new HTTPException(404, { message: "Project field not found" });
      }

      if (resolved.required && resolved.defaultValue !== null) {
        await fillEmptyProjectFieldValues(tx, {
          workspaceId: current.workspaceId,
          fieldId: id,
          value: resolved.defaultValue,
        });
      }

      return updated;
    });
    await publish("project-field.definition_changed", {
      workspaceId: field.workspaceId,
    });
    return toProjectFieldDefinition(field);
  } catch (error) {
    if (isProjectFieldNameConflict(error)) {
      throw new HTTPException(409, {
        message: "A project field with this name already exists",
      });
    }
    throw error;
  }
}
