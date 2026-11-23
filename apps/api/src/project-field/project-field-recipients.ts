import { eq } from "drizzle-orm";
import db from "../database";
import { userTable, workspaceUserTable } from "../database/schema";
import { instanceAdminRoleSql } from "../utils/instance-admin-role";

type Dependencies = {
  listWorkspaceMembers?: (workspaceId: string) => Promise<string[]>;
  listInstanceAdmins?: () => Promise<string[]>;
};

async function listWorkspaceMembers(workspaceId: string) {
  const rows = await db
    .select({ userId: workspaceUserTable.userId })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.workspaceId, workspaceId));
  return rows.map((row) => row.userId);
}

async function listInstanceAdmins() {
  const rows = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(instanceAdminRoleSql(userTable.role));
  return rows.map((row) => row.id);
}

// Restricted members stay in the set: they already know the workspace, and the
// wire message carries no project id, so they only refetch access-scoped rows.
export async function listProjectFieldRecipients(
  workspaceId: string,
  {
    listWorkspaceMembers: members = listWorkspaceMembers,
    listInstanceAdmins: admins = listInstanceAdmins,
  }: Dependencies = {},
) {
  const [workspaceMembers, instanceAdmins] = await Promise.all([
    members(workspaceId),
    admins(),
  ]);
  return new Set([...workspaceMembers, ...instanceAdmins]);
}
