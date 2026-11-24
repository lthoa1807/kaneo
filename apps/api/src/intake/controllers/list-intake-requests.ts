import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import db from "../../database";
import {
  intakeRequestTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { findInaccessibleProjectIds } from "../../project-access/find-inaccessible-project-ids";
import { workspacePermissionChecker } from "../../utils/require-workspace-permission";

// Same completed definition as get-project-statistics.
const completedSql = sql`case when ${taskTable.status} in ('done', 'archived') then 1 end`;

const emptyPage = (page: number, pageSize: number) => ({
  items: [] as never[],
  total: 0,
  page,
  pageSize,
  totalPages: 0,
});

type ListFilters = {
  projectId?: string;
  status?: string;
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

  const conditions: SQL[] = [];
  if (filters.projectId) {
    conditions.push(eq(intakeRequestTable.projectId, filters.projectId));
  }
  if (filters.status) {
    conditions.push(eq(intakeRequestTable.status, filters.status as never));
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
    conditions.push(inArray(intakeRequestTable.projectId, visible));
  } else {
    // Guest path: own requests only, in projects they still can access.
    const rows = await db
      .selectDistinct({ projectId: intakeRequestTable.projectId })
      .from(intakeRequestTable)
      .where(eq(intakeRequestTable.createdById, userId));
    const visible = await accessibleProjectIds(
      userId,
      rows.map((row) => row.projectId),
    );
    if (visible.length === 0) return emptyPage(filters.page, filters.limit);
    conditions.push(eq(intakeRequestTable.createdById, userId));
    conditions.push(inArray(intakeRequestTable.projectId, visible));
  }

  const where = and(...conditions);

  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(intakeRequestTable)
    .where(where);

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
      desc(intakeRequestTable.createdAt),
      desc(intakeRequestTable.number),
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
    page: filters.page,
    pageSize: filters.limit,
    totalPages: Math.ceil(Number(total) / filters.limit),
  };
}

export default listIntakeRequests;
