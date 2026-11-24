import { and, desc, eq, inArray } from "drizzle-orm";
import type { Context } from "hono";
import db, { schema } from "../../database";
import resolveIntakeActor from "../shared/intake-actor";

// Guest-facing trail: lifecycle moments only. Internal entries (task_linked,
// future ai.*) are manage-side.
export const GUEST_VISIBLE_ACTIVITY_TYPES = [
  "created",
  "status_changed",
  "revision_requested",
  "confirmed",
  "note_added",
] as const;

async function listIntakeActivity(c: Context, requestId: string) {
  const { isManager } = await resolveIntakeActor(c, requestId);

  const visibleTypes = isManager
    ? undefined
    : (GUEST_VISIBLE_ACTIVITY_TYPES as unknown as string[]);

  const items = await db
    .select({
      id: schema.intakeActivityTable.id,
      type: schema.intakeActivityTable.type,
      userId: schema.intakeActivityTable.userId,
      content: schema.intakeActivityTable.content,
      eventData: schema.intakeActivityTable.eventData,
      createdAt: schema.intakeActivityTable.createdAt,
    })
    .from(schema.intakeActivityTable)
    .where(
      visibleTypes
        ? and(
            eq(schema.intakeActivityTable.intakeRequestId, requestId),
            inArray(schema.intakeActivityTable.type, visibleTypes),
          )
        : eq(schema.intakeActivityTable.intakeRequestId, requestId),
    )
    .orderBy(desc(schema.intakeActivityTable.createdAt));

  return {
    items: items.map((item) => ({
      ...item,
      eventData: (item.eventData ?? null) as Record<string, unknown> | null,
    })),
  };
}

export default listIntakeActivity;
