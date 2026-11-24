import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  intakeActivityTable,
  intakeRequestTable,
  projectTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { assertProjectAccess } from "../../project-access/assert-project-access";
import { claimIntakeRequestNumber } from "./claim-intake-request-numbers";

export type CreateIntakeRequestInput = {
  projectId: string;
  workspaceId: string;
  title: string;
  description: string | null;
};

async function createIntakeRequest(
  input: CreateIntakeRequestInput,
  currentUserId: string,
) {
  await assertProjectAccess(currentUserId, input.projectId);

  const row = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ intakeEnabled: projectTable.intakeEnabled })
      .from(projectTable)
      .where(eq(projectTable.id, input.projectId))
      .limit(1);
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    if (!project.intakeEnabled) {
      throw new HTTPException(403, {
        message: "Intake is not enabled for this project",
      });
    }

    const number = await claimIntakeRequestNumber(input.projectId, tx);
    const [row] = await tx
      .insert(intakeRequestTable)
      .values({
        projectId: input.projectId,
        number,
        title: input.title,
        description: input.description,
        createdById: currentUserId,
      })
      .returning();

    if (!row) {
      throw new HTTPException(500, {
        message: "Failed to create intake request",
      });
    }

    await tx.insert(intakeActivityTable).values({
      intakeRequestId: row.id,
      type: "created",
      userId: currentUserId,
    });

    return row;
  });

  await publishEvent("intake_request.created", { ...row, currentUserId });

  return row;
}

export default createIntakeRequest;
