import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { ApiError } from "../../errors/api-error";
import resolveIntakeActor from "../shared/intake-actor";

type UpdateInput = {
  title?: string;
  description?: string | null;
};

async function updateIntakeRequest(
  c: Context,
  requestId: string,
  input: UpdateInput,
) {
  const { row } = await resolveIntakeActor(c, requestId);

  // PATCH is ownership-only (spec §7): staff act through transitions, not text edits.
  if (row.createdById !== c.get("userId")) {
    throw new HTTPException(404, { message: "Intake request not found" });
  }

  if (row.status !== "new") {
    throw new ApiError(409, {
      code: "REQUEST_NOT_EDITABLE",
      message: "Only new requests can be edited",
    });
  }

  const set: Partial<typeof schema.intakeRequestTable.$inferInsert> = {};
  if (input.title !== undefined) set.title = input.title;
  if (input.description !== undefined) set.description = input.description;

  const [updated] = await db
    .update(schema.intakeRequestTable)
    .set(set)
    .where(eq(schema.intakeRequestTable.id, requestId))
    .returning();
  if (!updated) {
    throw new HTTPException(404, { message: "Intake request not found" });
  }

  const [project] = await db
    .select({ name: schema.projectTable.name })
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, row.projectId))
    .limit(1);

  return {
    ...updated,
    projectName: project?.name ?? "",
    displayId: `REQ-${updated.number}`,
  };
}

export default updateIntakeRequest;
