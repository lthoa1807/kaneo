import { and, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import db from "../../database";
import {
  intakeRequestTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { findInaccessibleProjectIds } from "../../project-access/find-inaccessible-project-ids";
import { workspacePermissionChecker } from "../../utils/require-workspace-permission";
import { groupStatuses, type IntakeGroup } from "../intake-groups";

// Same completed definition as get-project-statistics.
const completedSql = sql`case when ${taskTable.status} in ('done', 'archived') then 1 end`;

const emptyCounts = () => ({ all: 0, waiting: 0, in_progress: 0, awaiting: 0 });

// One conditional count per group, built from the same mapping that filters
// the list so a status can never be counted by one and missed by the other.
const groupCount = (group: Exclude<IntakeGroup, "all">) =>
  count(
    sql`case when ${inArray(intakeRequestTable.status, groupStatuses(group))} then 1 end`,
  );

const emptyPage = (page: number, pageSize: number) => ({
  items: [] as never[],
  total: 0,
  counts: emptyCounts(),
  page,
  pageSize,
  totalPages: 0,
});

type ListFilters = {
  projectId?: string;
  status?: string;
  group?: IntakeGroup;
  page: number;
  limit: number;
};

async function accessibleProjectIds(
  userId: string,
  candidateIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0) return [];
  const denied = await findInaccessibleProjectIds(userId, candidateIds);
  return candidateIds.filter((id) => !denied.includes(id));
}

async function listIntakeRequests(
  c: Context,
  workspaceId: string,
  filters: ListFilters,
) {
  const userId = c.get("userId");
  const canManage = await workspacePermissionChecker(c);
  const isManager = canManage({ intakeRequest: ["manage"] });

  // The scope decides visibility: counts use it too, so the summary never
  // depends on the group/status filter or the page being shown.
  const scopeConditions: SQL[] = [];
  if (filters.projectId) {
    scopeConditions.push(eq(intakeRequestTable.projectId, filters.projectId));
  }

  if (isManager) {
    // Manage path: every request inside projects the actor can access.
    const rows = await db
      .selectDistinct({ id: intakeRequestTable.projectId })
      .from(intakeRequestTable)
      .innerJoin(
        projectTable,
        eq(projectTable.id, intakeRequestTable.projectId),
      )
      .where(eq(projectTable.workspaceId, workspaceId));
    const visible = await accessibleProjectIds(
      userId,
      rows.map((row) => row.id),
    );
    if (visible.length === 0) return emptyPage(filters.page, filters.limit);
    scopeConditions.push(inArray(intakeRequestTable.projectId, visible));
  } else {
    // Guest path: own requests only, in accessible projects of this workspace.
    const rows = await db
      .selectDistinct({ projectId: intakeRequestTable.projectId })
      .from(intakeRequestTable)
      .innerJoin(
        projectTable,
        eq(projectTable.id, intakeRequestTable.projectId),
      )
      .where(
        and(
          eq(intakeRequestTable.createdById, userId),
          eq(projectTable.workspaceId, workspaceId),
        ),
      );
    const visible = await accessibleProjectIds(
      userId,
      rows.map((row) => row.projectId),
    );
    if (visible.length === 0) return emptyPage(filters.page, filters.limit);
    scopeConditions.push(eq(intakeRequestTable.createdById, userId));
    scopeConditions.push(inArray(intakeRequestTable.projectId, visible));
  }

  const scopeWhere = and(...scopeConditions);

  const conditions = [...scopeConditions];
  if (filters.status) {
    conditions.push(eq(intakeRequestTable.status, filters.status as never));
  }
  if (filters.group && filters.group !== "all") {
    conditions.push(
      inArray(intakeRequestTable.status, groupStatuses(filters.group)),
    );
  }
  const where = and(...conditions);

  const [countRows, totalRows] = await Promise.all([
    db
      .select({
        all: count(),
        waiting: groupCount("waiting"),
        in_progress: groupCount("in_progress"),
        awaiting: groupCount("awaiting"),
      })
      .from(intakeRequestTable)
      .where(scopeWhere),
    db.select({ total: count() }).from(intakeRequestTable).where(where),
  ]);
  const counts = countRows[0] ?? emptyCounts();
  const total = totalRows[0]?.total ?? 0;

  const items = await db
    .select({
      id: intakeRequestTable.id,
      projectId: intakeRequestTable.projectId,
      projectName: projectTable.name,
      number: intakeRequestTable.number,
      title: intakeRequestTable.title,
      description: intakeRequestTable.description,
      status: intakeRequestTable.status,
      createdById: intakeRequestTable.createdById,
      requesterName: intakeRequestTable.requesterName,
      requesterEmail: intakeRequestTable.requesterEmail,
      sourceType: intakeRequestTable.sourceType,
      sourceId: intakeRequestTable.sourceId,
      externalReference: intakeRequestTable.externalReference,
      confirmedAt: intakeRequestTable.confirmedAt,
      createdAt: intakeRequestTable.createdAt,
      updatedAt: intakeRequestTable.updatedAt,
      taskCount: count(taskTable.id),
      completedTaskCount: count(completedSql),
    })
    .from(intakeRequestTable)
    .innerJoin(projectTable, eq(projectTable.id, intakeRequestTable.projectId))
    .leftJoin(taskTable, eq(taskTable.intakeRequestId, intakeRequestTable.id))
    .where(where)
    .orderBy(
      // Open work first, longest waiting on top; finished requests at the end.
      sql`case when ${intakeRequestTable.status} in ('confirmed', 'rejected') then 1 else 0 end`,
      intakeRequestTable.createdAt,
      intakeRequestTable.number,
      intakeRequestTable.id,
    )
    .limit(filters.limit)
    .offset((filters.page - 1) * filters.limit)
    .groupBy(intakeRequestTable.id, projectTable.name);

  return {
    items: items.map((item) => ({
      ...item,
      displayId: `REQ-${item.number}`,
      taskCount: Number(item.taskCount),
      completedTaskCount: Number(item.completedTaskCount),
    })),
    total: Number(total),
    counts: {
      all: Number(counts.all),
      waiting: Number(counts.waiting),
      in_progress: Number(counts.in_progress),
      awaiting: Number(counts.awaiting),
    },
    page: filters.page,
    pageSize: filters.limit,
    totalPages: Math.ceil(Number(total) / filters.limit),
  };
}

export default listIntakeRequests;
