import { and, asc, eq, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable, userTable } from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { BUCKET_ITEM_LIMIT } from "../dashboard-series";

/** Why "open" means these two statuses: see data-model.md §2. */
export const openTask = notInArray(taskTable.status, ["done", "archived"]);

/**
 * One scope for every dashboard count and row list, so a drilldown cannot
 * show a task the matching count left out.
 */
export function dashboardTaskWhere(request: {
  workspaceId: string;
  userId: string;
  condition?: SQL | undefined;
}) {
  return and(
    eq(projectTable.workspaceId, request.workspaceId),
    isNull(projectTable.archivedAt),
    openTask,
    projectAccessCondition(request.userId, projectTable.id),
    request.condition,
  );
}

/** Rows in the same order for every bucket: soonest due first, then priority. */
export function dashboardTaskRows(
  database: Pick<typeof db, "select">,
  request: {
    workspaceId: string;
    userId: string;
    condition?: SQL | undefined;
    limit?: number;
  },
) {
  return database
    .select({
      id: taskTable.id,
      ticket: sql<string>`${projectTable.slug} || '-' || ${taskTable.number}`,
      title: taskTable.title,
      projectId: taskTable.projectId,
      projectName: projectTable.name,
      assigneeId: taskTable.userId,
      assigneeName: userTable.name,
      priority: taskTable.priority,
      dueDate: taskTable.dueDate,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .where(dashboardTaskWhere(request))
    .orderBy(
      sql`${taskTable.dueDate} asc nulls last`,
      sql`case ${taskTable.priority} when 'urgent' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end desc`,
      asc(taskTable.id),
    )
    .limit(request.limit ?? BUCKET_ITEM_LIMIT);
}
