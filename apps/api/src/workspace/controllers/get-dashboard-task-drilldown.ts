import { and, count, eq, gte, lt } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { toBucket } from "../dashboard-series";
import { dashboardTaskRows, dashboardTaskWhere } from "./dashboard-task-rows";

/**
 * The chart segments carry no rows in the dashboard payload, so a click asks
 * for that one bucket. Same scope and order as the counts; at most 50 rows.
 */
async function getDashboardTaskDrilldown(request: {
  workspaceId: string;
  userId: string;
  priority?: string;
  projectId?: string;
  day?: string;
}) {
  const dayStart = request.day
    ? new Date(`${request.day}T00:00:00.000Z`)
    : undefined;
  const dayRange = dayStart
    ? and(
        gte(taskTable.dueDate, dayStart),
        lt(taskTable.dueDate, new Date(dayStart.getTime() + 86_400_000)),
      )
    : undefined;

  const condition = and(
    request.priority ? eq(taskTable.priority, request.priority) : undefined,
    request.projectId ? eq(taskTable.projectId, request.projectId) : undefined,
    request.day ? dayRange : undefined,
  );

  const [items, totals] = await Promise.all([
    dashboardTaskRows(db, {
      workspaceId: request.workspaceId,
      userId: request.userId,
      condition,
    }),
    db
      .select({ total: count() })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        dashboardTaskWhere({
          workspaceId: request.workspaceId,
          userId: request.userId,
          condition,
        }),
      ),
  ]);

  return toBucket(items, Number(totals.at(0)?.total ?? 0));
}

export default getDashboardTaskDrilldown;
