import { and, eq } from "drizzle-orm";
import db, { schema } from "../../database";
import { isGuestRole } from "../../workspace-members/is-guest-role";

type MembershipKind = "guest" | "staff";

async function getMyMembership(workspaceId: string, userId: string) {
  // One query for both: a guest holds no workspace:read, so this endpoint is the
  // only place the web can learn the workspace's name.
  const [row] = await db
    .select({
      name: schema.workspaceTable.name,
      role: schema.workspaceUserTable.role,
    })
    .from(schema.workspaceTable)
    .leftJoin(
      schema.workspaceUserTable,
      and(
        eq(schema.workspaceUserTable.workspaceId, schema.workspaceTable.id),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    )
    .where(eq(schema.workspaceTable.id, workspaceId))
    .limit(1);

  const role = row?.role ?? null;
  const kind: MembershipKind = isGuestRole(role) ? "guest" : "staff";
  return { workspaceName: row?.name ?? "", kind, role };
}

export default getMyMembership;
