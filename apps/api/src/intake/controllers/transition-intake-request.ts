import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import db, { schema } from "../../database";
import { ApiError } from "../../errors/api-error";
import { publishEvent } from "../../events";
import resolveIntakeActor from "../shared/intake-actor";

// The lifecycle map (spec §4): one place defining every legal move. "manage"
// actors are staff triaging and working the request; "guest" moves are the
// owner's delivery verdicts (confirm / needs revision).
type TransitionTo =
  | "triaged"
  | "rejected"
  | "approved"
  | "in_progress"
  | "delivered"
  | "needs_revision"
  | "confirmed";

type TransitionRule = {
  from: string[];
  actor: "manage" | "guest";
  noteRequired?: boolean;
};

const TRANSITIONS: Record<TransitionTo, TransitionRule> = {
  triaged: { from: ["new"], actor: "manage" },
  rejected: { from: ["new", "triaged"], actor: "manage", noteRequired: true },
  approved: { from: ["new", "triaged"], actor: "manage" },
  in_progress: { from: ["approved", "needs_revision"], actor: "manage" },
  delivered: { from: ["in_progress"], actor: "manage" },
  needs_revision: { from: ["delivered"], actor: "guest", noteRequired: true },
  confirmed: { from: ["delivered"], actor: "guest" },
};

type TransitionInput = {
  to: TransitionTo;
  note?: string;
};

function conflict(currentStatus: string, to: string) {
  return new ApiError(409, {
    code: "REQUEST_STATUS_TRANSITION",
    message: `An intake request in ${currentStatus} cannot move to ${to}`,
    currentStatus,
  });
}

async function transitionIntakeRequest(
  c: Context,
  requestId: string,
  input: TransitionInput,
) {
  const { row, isManager } = await resolveIntakeActor(c, requestId);
  const actorClass = isManager ? "manage" : "guest";
  const target = TRANSITIONS[input.to];

  if (
    !target ||
    !target.from.includes(row.status) ||
    target.actor !== actorClass
  ) {
    throw conflict(row.status, input.to);
  }

  const note = input.note?.trim();
  if (target.noteRequired && !note) {
    throw new ApiError(400, {
      code: "NOTE_REQUIRED",
      message: "A note is required for this transition",
    });
  }

  const to = input.to;
  const confirming = to === "confirmed";
  const userId = c.get("userId");

  const updated = await db.transaction(async (tx) => {
    // Optimistic guard: only transition from the status we observed.
    const [updatedRow] = await tx
      .update(schema.intakeRequestTable)
      .set({
        status: to,
        ...(confirming
          ? { confirmedAt: new Date(), confirmedVia: "guest_portal" }
          : {}),
      })
      .where(
        and(
          eq(schema.intakeRequestTable.id, requestId),
          eq(schema.intakeRequestTable.status, row.status),
        ),
      )
      .returning();

    if (!updatedRow) {
      const [fresh] = await tx
        .select({ status: schema.intakeRequestTable.status })
        .from(schema.intakeRequestTable)
        .where(eq(schema.intakeRequestTable.id, requestId))
        .limit(1);
      throw conflict(fresh?.status ?? row.status, to);
    }

    await tx.insert(schema.intakeActivityTable).values({
      intakeRequestId: requestId,
      type: "status_changed",
      userId,
      content: note ?? null,
      eventData: { from: row.status, to },
    });

    if (confirming) {
      await tx.insert(schema.intakeActivityTable).values({
        intakeRequestId: requestId,
        type: "confirmed",
        userId,
        eventData: { from: row.status, to },
      });
    }

    return updatedRow;
  });

  await publishEvent("intake_request.updated", {
    ...updated,
    currentUserId: userId,
    type: "status_changed",
    from: row.status,
    to,
  });

  const [project] = await db
    .select({ name: schema.projectTable.name })
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, updated.projectId))
    .limit(1);

  return {
    ...updated,
    projectName: project?.name ?? "",
    displayId: `REQ-${updated.number}`,
  };
}

export default transitionIntakeRequest;
