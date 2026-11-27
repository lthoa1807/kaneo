import { pagingNumber, z } from "../openapi";
import { INTAKE_GROUP_VALUES } from "./intake-groups";
import { intakeStatusSchema } from "./response";

export const requestIdParam = z.object({ requestId: z.string() });

export const createIntakeRequestBody = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
});

export const listIntakeRequestsQuery = z.object({
  projectId: z.string().optional(),
  status: intakeStatusSchema.optional(),
  group: z.enum(INTAKE_GROUP_VALUES).optional().openapi({
    description:
      "Guest portal group. `all` includes finished requests; waiting/in_progress/awaiting only cover open work. Counts ignore this filter.",
  }),
  page: pagingNumber(1, 1_000_000, 1),
  limit: pagingNumber(1, 100, 20),
});

export const updateIntakeRequestBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(10_000).nullable().optional(),
  })
  .refine(
    (body) => body.title !== undefined || body.description !== undefined,
    "Nothing to update",
  );

export const transitionIntakeRequestBody = z.object({
  to: z.enum([
    "triaged",
    "rejected",
    "approved",
    "in_progress",
    "delivered",
    "needs_revision",
    "confirmed",
  ]),
  note: z.string().max(10_000).optional(),
});
