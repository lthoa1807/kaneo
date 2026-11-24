import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { intakeRequestTable } from "../../database/schema";
import { workspacePermissionChecker } from "../../utils/require-workspace-permission";

/**
 * Loads the intake request once and classifies the actor. Manage holders act
 * across projects they can access; everyone else is ownership-scoped and a
 * miss is a 404 (never a 403) so existence is not confirmed.
 */
async function resolveIntakeActor(
  c: Context,
  requestId: string,
): Promise<{
  row: typeof intakeRequestTable.$inferSelect;
  isManager: boolean;
}> {
  const [row] = await db
    .select()
    .from(intakeRequestTable)
    .where(eq(intakeRequestTable.id, requestId))
    .limit(1);
  if (!row) {
    throw new HTTPException(404, { message: "Intake request not found" });
  }

  const canManage = await workspacePermissionChecker(c);
  const isManager = canManage({ intakeRequest: ["manage"] });

  if (!isManager && row.createdById !== c.get("userId")) {
    throw new HTTPException(404, { message: "Intake request not found" });
  }

  return { row, isManager };
}

export default resolveIntakeActor;
