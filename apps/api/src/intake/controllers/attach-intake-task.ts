import type { Context } from "hono";
import { schema } from "../../database";
import { ApiError } from "../../errors/api-error";
import { publishEvent } from "../../events";
import createTask from "../../task/controllers/create-task";
import type { TaskRecurrence } from "../../task/recurrence/schema";
import resolveIntakeActor from "../shared/intake-actor";

// Tasks are attached once triage approved the work and until the guest's
// verdict (confirmed / rejected ends the lifecycle).
const ATTACHABLE_STATUSES = ["approved", "in_progress", "needs_revision"];

type AttachInput = {
  title: string;
  description: string;
  status: string;
  priority?: string;
  userId?: string;
  startDate?: Date;
  dueDate?: Date;
  recurrence?: TaskRecurrence;
  customFields?: Array<{ fieldId: string; value: string }>;
  draftAssetIds?: string[];
};

async function attachIntakeTask(
  c: Context,
  requestId: string,
  input: AttachInput,
) {
  const { row } = await resolveIntakeActor(c, requestId);

  if (!ATTACHABLE_STATUSES.includes(row.status)) {
    throw new ApiError(409, {
      code: "REQUEST_NOT_TASK_ATTACHABLE",
      message:
        "Tasks can only be attached while an intake request is approved, in progress, or needs revision",
    });
  }

  const userId = c.get("userId");
  const task = await createTask({
    projectId: row.projectId,
    currentUserId: userId,
    intakeRequestId: requestId,
    withinTransaction: async (tx, created) => {
      await tx.insert(schema.intakeActivityTable).values({
        intakeRequestId: requestId,
        type: "task_linked",
        userId,
        eventData: { taskId: created.id },
      });
    },
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    userId: input.userId,
    startDate: input.startDate,
    dueDate: input.dueDate,
    recurrence: input.recurrence,
    customFields: input.customFields,
    draftAssetIds: input.draftAssetIds,
  });

  await publishEvent("intake_request.updated", {
    ...row,
    currentUserId: userId,
    type: "task_linked",
    taskId: task.id,
  });

  return task;
}

export default attachIntakeTask;
