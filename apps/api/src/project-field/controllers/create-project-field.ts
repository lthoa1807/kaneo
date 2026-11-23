import { eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { publishEvent } from "../../events";
import { workspaceCustomFieldDefinitionTable } from "../../database/schema";
import { lockProjectOrdering } from "../../project/controllers/project-placement";
import {
  assertValidProjectFieldDefinition,
  isProjectFieldNameConflict,
  normalizeProjectFieldDefinition,
} from "../definition-rules";
import { backfillProjectFieldDefault } from "../project-field-defaults";
import { toProjectFieldDefinition } from "../to-project-field-definition";
import type { ProjectFieldDefinitionInput } from "../types";

export type ProjectFieldPublisher = (
  type: string,
  data: unknown,
) => Promise<void>;

export default async function createProjectField(
  input: ProjectFieldDefinitionInput,
  publish: ProjectFieldPublisher = publishEvent,
) {
  try {
    const field = await db.transaction(async (tx) => {
      await lockProjectOrdering(tx, input.workspaceId);
      const normalized = normalizeProjectFieldDefinition(input);
      await assertValidProjectFieldDefinition(
        tx,
        input.workspaceId,
        normalized,
      );

      const [{ maxPosition } = { maxPosition: null }] = await tx
        .select({
          maxPosition: max(workspaceCustomFieldDefinitionTable.position),
        })
        .from(workspaceCustomFieldDefinitionTable)
        .where(
          eq(
            workspaceCustomFieldDefinitionTable.workspaceId,
            input.workspaceId,
          ),
        );

      const [created] = await tx
        .insert(workspaceCustomFieldDefinitionTable)
        .values({
          workspaceId: input.workspaceId,
          ...normalized,
          position: (maxPosition ?? 0) + 1,
        })
        .returning();
      if (!created) {
        throw new HTTPException(500, {
          message: "Failed to create project field",
        });
      }

      if (normalized.defaultValue !== null) {
        await backfillProjectFieldDefault(tx, {
          workspaceId: input.workspaceId,
          fieldId: created.id,
          value: normalized.defaultValue,
        });
      }
      return created;
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
