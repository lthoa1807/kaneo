import { and, eq, sql } from "drizzle-orm";
import db, { schema } from "../../database";
import { projectAccessCondition } from "../../project-access/project-access-condition";
import { rolesAllow } from "../../utils/role-permissions";
import { splitRoles } from "../../utils/split-roles";

/**
 * Staff who should hear about a request: members of the project's workspace who
 * hold `intakeRequest:manage` and can access the project. Computed from the
 * database on every event, so a role change takes effect immediately and an
 * event payload can never name its own recipients.
 */
async function staffRecipientsForIntake({
  projectId,
  workspaceId,
  excludeUserId,
}: {
  projectId: string;
  workspaceId: string;
  excludeUserId?: string;
}): Promise<string[]> {
  const [storedRoles, members] = await Promise.all([
    db
      .select({
        role: schema.workspaceRoleTable.role,
        permission: schema.workspaceRoleTable.permission,
      })
      .from(schema.workspaceRoleTable)
      .where(eq(schema.workspaceRoleTable.workspaceId, workspaceId)),
    db
      .select({
        userId: schema.workspaceUserTable.userId,
        role: schema.workspaceUserTable.role,
      })
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspaceId),
          sql<boolean>`${projectAccessCondition(
            schema.workspaceUserTable.userId,
            projectId,
          )}`,
        ),
      ),
  ]);

  return members
    .filter((member) => member.userId !== excludeUserId)
    .filter((member) =>
      rolesAllow(splitRoles(member.role), storedRoles, {
        intakeRequest: ["manage"],
      }),
    )
    .map((member) => member.userId);
}

export default staffRecipientsForIntake;
