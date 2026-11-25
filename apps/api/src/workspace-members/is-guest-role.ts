import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { splitRoles } from "../utils/split-roles";

// The role column stores one or more role names; `guest` is a reserved role.
export function isGuestRole(role: string | null | undefined): boolean {
  return splitRoles(role).includes("guest");
}

// Submitting is the guest's job: staff work on the request and file tasks
// directly. Guarding on identity means a role that still holds the `create`
// action cannot file requests, so a stale role row cannot reopen this.
export async function assertGuestMember(workspaceId: string, userId: string) {
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
  if (!isGuestRole(member?.role)) {
    throw new HTTPException(403, {
      message: "Only guests can submit intake requests",
    });
  }
}
