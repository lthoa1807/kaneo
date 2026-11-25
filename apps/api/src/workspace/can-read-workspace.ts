import { sql } from "drizzle-orm";
import { userTable, workspaceUserTable } from "../database/schema";
import { instanceAdminRoleSql } from "../utils/instance-admin-role";
import {
  rolesAllow,
  type StoredRolePermission,
} from "../utils/role-permissions";
import { splitRoles } from "../utils/split-roles";
import { isGuestRole } from "../workspace-members/is-guest-role";

export const workspaceAccessColumns = {
  role: workspaceUserTable.role,
  instanceAdmin: sql<boolean>`coalesce(${instanceAdminRoleSql(userTable.role)}, false)`,
};

export type WorkspaceAccess = {
  role: string | null;
  instanceAdmin: boolean;
};

export function canReadWorkspace(
  access: WorkspaceAccess,
  storedRoles: readonly StoredRolePermission[],
) {
  if (access.instanceAdmin) return true;
  // A guest holds no workspace:read but the app still has to route them: the
  // workspace list is what sends a signed-in guest to their requests page.
  if (isGuestRole(access.role)) return true;
  return rolesAllow(splitRoles(access.role), storedRoles, {
    workspace: ["read"],
  });
}
