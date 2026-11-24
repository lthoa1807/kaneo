import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";

export const intakeStatusSchema = z
  .enum([
    "new",
    "triaged",
    "rejected",
    "approved",
    "in_progress",
    "delivered",
    "needs_revision",
    "confirmed",
  ])
  .openapi({ description: "The intake request lifecycle status." });

export const intakeRequestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string().openapi({
    description:
      "Display-only project name, embedded so guests need no project:* permission.",
  }),
  number: z.number(),
  displayId: z.string().openapi({
    description: "Human identifier, `REQ-<number>`.",
  }),
  title: z.string(),
  description: z.string().nullable(),
  status: intakeStatusSchema,
  createdById: z.string(),
  requesterName: z.string().nullable(),
  requesterEmail: z.string().nullable(),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  externalReference: z.string().nullable(),
  confirmedAt: nullableResponseTimestamp,
  createdAt: responseTimestamp,
  updatedAt: responseTimestamp,
});

export const intakeRequestListItemSchema = intakeRequestSchema.extend({
  taskCount: z.number().openapi({
    description: "Linked tasks, across all statuses.",
  }),
  completedTaskCount: z.number().openapi({
    description: "Linked tasks whose status is done or archived.",
  }),
});

export const intakeRequestListSchema = z.object({
  items: z.array(intakeRequestListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const intakeActivitySchema = z.object({
  id: z.string(),
  type: z.string(),
  userId: z.string().nullable(),
  content: z.string().nullable(),
  eventData: z.record(z.string(), z.unknown()).nullable().openapi({
    description: "Structured payload, e.g. { from, to } for status changes.",
  }),
  createdAt: responseTimestamp,
});

export const intakeActivityListSchema = z.object({
  items: z.array(intakeActivitySchema),
});

export const intakeRequestDetailSchema = intakeRequestListItemSchema.extend({
  projectSlug: z.string().openapi({
    description:
      "Project key used to build task keys such as `PE-12`, embedded for the same reason as the name.",
  }),
  linkedTasks: z
    .array(
      z.object({
        id: z.string(),
        number: z.number().nullable(),
        title: z.string(),
        status: z.string(),
      }),
    )
    .optional()
    .openapi({
      description:
        "Linked tasks for manage holders; omitted for guests, who only see the progress counts.",
    }),
});
