import { and, eq, isNull } from "drizzle-orm";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import {
  EMPTY_STATISTICS,
  getWorkspaceProjectStatistics,
} from "./get-project-statistics";

async function getProjects(
  workspaceId: string,
  userId: string,
  includeArchived = false,
) {
  const projects = await db.query.projectTable.findMany({
    where: and(
      eq(projectTable.workspaceId, workspaceId),
      includeArchived ? undefined : isNull(projectTable.archivedAt),
      projectAccessCondition(userId, projectTable.id),
    ),
    // `id` is the deterministic tie-breaker: without it, rows sharing both a
    // position and a createdAt come back in an unspecified order.
    orderBy: (project, { asc }) => [
      asc(project.position),
      asc(project.createdAt),
      asc(project.id),
    ],
  });

  const statisticsByProject = await getWorkspaceProjectStatistics(
    db,
    workspaceId,
    userId,
    includeArchived,
  );

  return projects.map((project) => ({
    ...project,
    statistics: statisticsByProject.get(project.id) ?? EMPTY_STATISTICS,
    archivedTasks: [],
    plannedTasks: [],
    columns: [],
  }));
}

export default getProjects;
