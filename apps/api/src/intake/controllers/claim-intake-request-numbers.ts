import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function claimIntakeRequestNumbers(
  projectId: string,
  count: number,
  dbOrTx: DbOrTx = db,
) {
  const [updated] = await dbOrTx
    .update(projectTable)
    .set({
      lastIntakeRequestNumber: sql`${projectTable.lastIntakeRequestNumber} + ${count}`,
    })
    .where(eq(projectTable.id, projectId))
    .returning({
      lastIntakeRequestNumber: projectTable.lastIntakeRequestNumber,
    });

  if (!updated) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  return updated.lastIntakeRequestNumber - count + 1;
}

export async function claimIntakeRequestNumber(
  projectId: string,
  dbOrTx: DbOrTx = db,
) {
  return claimIntakeRequestNumbers(projectId, 1, dbOrTx);
}

export default claimIntakeRequestNumbers;
