import { pagingNumber, z } from "../openapi";
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
  page: pagingNumber(1, 1_000_000, 1),
  limit: pagingNumber(1, 100, 20),
});
