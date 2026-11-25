import { and, eq, inArray, type SQLWrapper, sql } from "drizzle-orm";
import db from "../database";
import {
  userTable,
  workspaceRoleTable,
  workspaceUserTable,
} from "../database/schema";
import { projectAccessCondition } from "../project-access/project-access-condition";
import { hasInstanceAdminRole } from "../utils/instance-admin-role";
import { type PermissionMap, rolesAllow } from "../utils/role-permissions";
import { splitRoles } from "../utils/split-roles";
import { notBannedCondition } from "../utils/user-ban";
import { workspacePermissionGrants } from "../utils/workspace-permission-grants";

// The read action each resource type needs before it can be delivered.
const REQUIRED_READ: Record<string, PermissionMap> = {
  task: { task: ["read"] },
  intake_request: { intakeRequest: ["read"] },
  workspace: { workspace: ["read"] },
};

// Membership, rather than public visibility or global admin privileges, defines
// who may be subscribed to private task activity. Archived workspaces hide
// their notifications until restored. Use the same predicate when
// creating, reading and delivering notifications, including historical rows.
export function notificationResourceAccess(
  userId: string,
  resourceId: string | null | SQLWrapper,
  resourceType: string | null | SQLWrapper,
  readGrants?: {
    taskWorkspaceIds: string[];
    workspaceIds: string[];
    intakeReadWorkspaceIds: string[];
    intakeManageWorkspaceIds: string[];
  },
) {
  const taskRead = readGrants
    ? inArray(
        sql`notification_project.workspace_id`,
        readGrants.taskWorkspaceIds,
      )
    : sql`true`;
  const workspaceRead = readGrants
    ? inArray(sql`notification_member.workspace_id`, readGrants.workspaceIds)
    : sql`true`;
  // A request is visible to the guest who filed it and to the staff who may
  // manage intake there, which mirrors `resolveIntakeActor` on the routes.
  const intakeRead = readGrants
    ? inArray(
        sql`notification_request_project.workspace_id`,
        readGrants.intakeReadWorkspaceIds,
      )
    : sql`true`;
  const intakeManage = readGrants
    ? inArray(
        sql`notification_request_project.workspace_id`,
        readGrants.intakeManageWorkspaceIds,
      )
    : sql`true`;
  return sql<boolean>`(
    (${resourceId}::text IS NULL AND ${resourceType}::text IS NULL)
    OR (${resourceType}::text = 'task' AND EXISTS (
      SELECT 1 FROM task AS notification_task
      JOIN project AS notification_project ON notification_project.id = notification_task.project_id
      JOIN workspace_member AS notification_member ON notification_member.workspace_id = notification_project.workspace_id
      JOIN workspace AS notification_workspace ON notification_workspace.id = notification_project.workspace_id
      WHERE notification_task.id = ${resourceId} AND notification_member.user_id = ${userId}
        AND notification_workspace.archived_at IS NULL
        AND ${projectAccessCondition(userId, sql`notification_project.id`)}
        AND ${taskRead}
    ))
    OR (${resourceType}::text = 'intake_request' AND EXISTS (
      SELECT 1 FROM intake_request AS notification_request
      JOIN project AS notification_request_project ON notification_request_project.id = notification_request.project_id
      JOIN workspace_member AS notification_request_member ON notification_request_member.workspace_id = notification_request_project.workspace_id
      JOIN workspace AS notification_request_workspace ON notification_request_workspace.id = notification_request_project.workspace_id
      WHERE notification_request.id = ${resourceId} AND notification_request_member.user_id = ${userId}
        AND notification_request_workspace.archived_at IS NULL
        AND ${projectAccessCondition(userId, sql`notification_request_project.id`)}
        AND ${intakeRead}
        AND (notification_request.created_by_id = ${userId} OR ${intakeManage})
    ))
    OR (${resourceType}::text = 'workspace' AND EXISTS (
      SELECT 1 FROM workspace_member AS notification_member
      JOIN workspace AS notification_workspace ON notification_workspace.id = notification_member.workspace_id
      WHERE notification_member.workspace_id = ${resourceId} AND notification_member.user_id = ${userId}
        AND notification_workspace.archived_at IS NULL
        AND ${workspaceRead}
    ))
  )`;
}

// Apply current role and key grants in SQL before list limits or UPDATE RETURNING.
// One batch covers every involved workspace, regardless of notification count.
export async function notificationReadAccess(
  userId: string,
  resourceId: string | null | SQLWrapper,
  resourceType: string | null | SQLWrapper,
  apiKeyPermissions?: PermissionMap | null,
  workspaceId?: string,
) {
  const grants = await workspacePermissionGrants(userId, {
    apiKeyPermissions,
    workspaceIds: workspaceId ? [workspaceId] : undefined,
  });
  return notificationResourceAccess(userId, resourceId, resourceType, {
    taskWorkspaceIds: grants.workspaceIds.filter((id) =>
      grants.allows(id, { task: ["read"] }),
    ),
    workspaceIds: grants.workspaceIds.filter((id) =>
      grants.allows(id, { workspace: ["read"] }),
    ),
    intakeReadWorkspaceIds: grants.workspaceIds.filter((id) =>
      grants.allows(id, { intakeRequest: ["read"] }),
    ),
    intakeManageWorkspaceIds: grants.workspaceIds.filter((id) =>
      grants.allows(id, { intakeRequest: ["manage"] }),
    ),
  });
}

export async function canReceiveResourceNotification(
  userId: string,
  resourceId?: string | null,
  resourceType?: string | null,
  database: Pick<typeof db, "select"> = db,
) {
  // Keep creation/delivery authorization to one SELECT, including when the
  // caller injects a transaction. Joining the current resource's role rows
  // avoids adding grant lookups for every recipient or scheduled reminder.
  const workspaceId = sql<string>`CASE
    WHEN ${resourceType ?? null}::text = 'workspace' THEN ${resourceId ?? null}::text
    WHEN ${resourceType ?? null}::text = 'task' THEN (
      SELECT recipient_project.workspace_id FROM task AS recipient_task
      JOIN project AS recipient_project ON recipient_project.id = recipient_task.project_id
      WHERE recipient_task.id = ${resourceId ?? null}
    )
    WHEN ${resourceType ?? null}::text = 'intake_request' THEN (
      SELECT recipient_request_project.workspace_id FROM intake_request AS recipient_request
      JOIN project AS recipient_request_project ON recipient_request_project.id = recipient_request.project_id
      WHERE recipient_request.id = ${resourceId ?? null}
    )
  END`;
  const intakeOwnerId = sql<string | null>`CASE
    WHEN ${resourceType ?? null}::text = 'intake_request' THEN (
      SELECT owner_request.created_by_id FROM intake_request AS owner_request
      WHERE owner_request.id = ${resourceId ?? null}
    )
  END`;
  const rows = await database
    .select({
      id: userTable.id,
      instanceRole: userTable.role,
      memberRole: workspaceUserTable.role,
      intakeOwnerId,
      storedRole: workspaceRoleTable.role,
      permission: workspaceRoleTable.permission,
    })
    .from(userTable)
    .leftJoin(
      workspaceUserTable,
      and(
        eq(workspaceUserTable.userId, userTable.id),
        eq(workspaceUserTable.workspaceId, workspaceId),
      ),
    )
    .leftJoin(
      workspaceRoleTable,
      eq(workspaceRoleTable.workspaceId, workspaceUserTable.workspaceId),
    )
    .where(
      and(
        eq(userTable.id, userId),
        notBannedCondition(),
        notificationResourceAccess(
          userId,
          resourceId ?? null,
          resourceType ?? null,
        ),
      ),
    );
  if (!rows.length) return false;
  if (!resourceId && !resourceType) return true;
  if (hasInstanceAdminRole(rows[0]?.instanceRole)) return true;
  const granted = (permission: PermissionMap) =>
    rolesAllow(
      splitRoles(rows[0]?.memberRole),
      rows.flatMap((row) =>
        row.storedRole
          ? [{ role: row.storedRole, permission: row.permission }]
          : [],
      ),
      permission,
    );
  // Managing intake implies hearing about it, so a custom role holding only
  // `manage` is not silently cut out of the notifications it can act on.
  const canRead =
    granted(
      REQUIRED_READ[resourceType ?? "workspace"] ?? { workspace: ["read"] },
    ) ||
    (resourceType === "intake_request" &&
      granted({ intakeRequest: ["manage"] }));
  if (!canRead) return false;
  // Reading intake is ownership-scoped: a guest only hears about their own
  // requests, staff need the manage action to hear about anyone's.
  if (resourceType === "intake_request") {
    return (
      rows[0]?.intakeOwnerId === userId ||
      granted({ intakeRequest: ["manage"] })
    );
  }
  return true;
}
