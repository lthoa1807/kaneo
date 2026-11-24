import { and, eq } from "drizzle-orm";
import db, { schema } from "../../database";
import { isGuestRole } from "../../workspace-members/is-guest-role";

type MembershipKind = "guest" | "staff";

async function getMyMembership(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: schema.workspaceUserTable.role })
    .from(schema.workspaceUserTable)
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);

  const [workspace] = await db
    .select({ name: schema.workspaceTable.name })
    .from(schema.workspaceTable)
    .where(eq(schema.workspaceTable.id, workspaceId))
    .limit(1);

  const role = member?.role ?? null;
  const kind: MembershipKind = isGuestRole(role) ? "guest" : "staff";
  return { workspaceName: workspace?.name ?? "", kind, role };
}

export default getMyMembership;
