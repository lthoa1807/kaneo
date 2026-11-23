import { asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import db, { schema } from "../../database";
import resolveIntakeActor from "../shared/intake-actor";

async function progressCounts(intakeRequestId: string) {
  const rows = await db
    .select({
      id: schema.taskTable.id,
      number: schema.taskTable.number,
      title: schema.taskTable.title,
      status: schema.taskTable.status,
    })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.intakeRequestId, intakeRequestId))
    .orderBy(asc(schema.taskTable.number));

  const completedTaskCount = rows.filter(
    (task) => task.status === "done" || task.status === "archived",
  ).length;

  return {
    rows,
    taskCount: rows.length,
    completedTaskCount,
  };
}

async function getIntakeRequest(c: Context, requestId: string) {
  const { row, isManager } = await resolveIntakeActor(c, requestId);

  const [project] = await db
    .select({ name: schema.projectTable.name })
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, row.projectId))
    .limit(1);

  const { rows, taskCount, completedTaskCount } =
    await progressCounts(requestId);

  const base = {
    ...row,
    projectName: project?.name ?? "",
    displayId: `REQ-${row.number}`,
    taskCount,
    completedTaskCount,
  };

  // Guests see progress only, never task internals.
  if (!isManager) return base;

  return {
    ...base,
    linkedTasks: rows.map(({ id, number, title, status }) => ({
      id,
      number,
      title,
      status,
    })),
  };
}

export default getIntakeRequest;
