import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import {
  DUE_SOON_DAYS,
  type DueSoonDays,
  buildDueDaySeries,
  buildPrioritySeries,
  toBucket,
} from "../dashboard-series";
import { dashboardTaskRows, dashboardTaskWhere } from "./dashboard-task-rows";

const URGENT_PRIORITIES = ["urgent", "high"];
const urgentTask = inArray(taskTable.priority, URGENT_PRIORITIES);

async function getWorkspaceDashboard(request: {
  workspaceId: string;
  userId: string;
  now?: Date;
}) {
  const { workspaceId, userId } = request;
  const now = request.now ?? new Date();
  const dueSoonEnd = new Date(now.getTime() + DUE_SOON_DAYS * 86_400_000);

  const overdue = lt(taskTable.dueDate, now);
  const dueSoon = and(
    gte(taskTable.dueDate, now),
    lt(taskTable.dueDate, dueSoonEnd),
  );

  const bucketConditions = {
    mineOverdue: and(eq(taskTable.userId, userId), overdue)!,
    overdueUrgent: and(overdue, urgentTask)!,
    dueSoon: dueSoon!,
    unassigned: isNull(taskTable.userId),
  };

  const countFilter = (condition: typeof overdue) =>
    count(sql`case when ${condition} then 1 end`);

  const [totals] = await db
    .select({
      mineOverdue: countFilter(bucketConditions.mineOverdue),
      overdueUrgent: countFilter(bucketConditions.overdueUrgent),
      dueSoon: countFilter(bucketConditions.dueSoon),
      dueSoonUrgent: countFilter(and(bucketConditions.dueSoon, urgentTask)!),
      unassigned: countFilter(bucketConditions.unassigned),
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(dashboardTaskWhere({ workspaceId, userId }));

  const [mineOverdueItems, overdueUrgentItems, dueSoonItems, unassignedItems] =
    await Promise.all([
      dashboardTaskRows(db, {
        workspaceId,
        userId,
        condition: bucketConditions.mineOverdue,
      }),
      dashboardTaskRows(db, {
        workspaceId,
        userId,
        condition: bucketConditions.overdueUrgent,
      }),
      dashboardTaskRows(db, {
        workspaceId,
        userId,
        condition: bucketConditions.dueSoon,
      }),
      dashboardTaskRows(db, {
        workspaceId,
        userId,
        condition: bucketConditions.unassigned,
      }),
    ]);

  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + 7 * 86_400_000);

  const [priorityRows, dayRows, projectRows] = await Promise.all([
    db
      .select({ priority: taskTable.priority, count: count() })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(dashboardTaskWhere({ workspaceId, userId }))
      .groupBy(taskTable.priority),
    db
      .select({
        date: sql<string>`to_char(${taskTable.dueDate}, 'YYYY-MM-DD')`,
        count: count(),
        urgent: count(sql`case when ${urgentTask} then 1 end`),
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        dashboardTaskWhere({
          workspaceId,
          userId,
          condition: and(
            gte(taskTable.dueDate, dayStart),
            lt(taskTable.dueDate, dayEnd),
          ),
        }),
      )
      .groupBy(sql`to_char(${taskTable.dueDate}, 'YYYY-MM-DD')`),
    db
      .select({
        projectId: projectTable.id,
        name: projectTable.name,
        count: count(taskTable.id),
      })
      .from(projectTable)
      .leftJoin(
        taskTable,
        and(
          eq(taskTable.projectId, projectTable.id),
          sql`${taskTable.status} not in ('done', 'archived')`,
        ),
      )
      .where(
        and(
          eq(projectTable.workspaceId, workspaceId),
          isNull(projectTable.archivedAt),
          projectAccessCondition(userId, projectTable.id),
        ),
      )
      .groupBy(projectTable.id, projectTable.name)
      .orderBy(desc(count(taskTable.id)), asc(projectTable.name)),
  ]);

  return {
    generatedAt: now,
    tasks: {
      mineOverdue: toBucket(mineOverdueItems, Number(totals?.mineOverdue ?? 0)),
      overdueUrgent: toBucket(
        overdueUrgentItems,
        Number(totals?.overdueUrgent ?? 0),
      ),
      dueSoon: {
        ...toBucket(dueSoonItems, Number(totals?.dueSoon ?? 0)),
        urgent: Number(totals?.dueSoonUrgent ?? 0),
        withinDays: DUE_SOON_DAYS as DueSoonDays,
      },
      unassigned: toBucket(unassignedItems, Number(totals?.unassigned ?? 0)),
    },
    charts: {
      byPriority: buildPrioritySeries(priorityRows),
      dueByDay: buildDueDaySeries(dayRows, now),
      byProject: projectRows.map((row) => ({
        projectId: row.projectId,
        name: row.name,
        count: Number(row.count),
      })),
    },
  };
}

export default getWorkspaceDashboard;
