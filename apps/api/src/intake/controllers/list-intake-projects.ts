import { and, asc, eq } from "drizzle-orm";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { findInaccessibleProjectIds } from "../../project-access/find-inaccessible-project-ids";

async function listIntakeProjects(workspaceId: string, userId: string) {
  const candidates = await db
    .select({ id: projectTable.id, name: projectTable.name })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        eq(projectTable.intakeEnabled, true),
      ),
    )
    .orderBy(asc(projectTable.name));

  const denied = await findInaccessibleProjectIds(
    userId,
    candidates.map((project) => project.id),
  );

  return candidates.filter((project) => !denied.includes(project.id));
}

export default listIntakeProjects;
