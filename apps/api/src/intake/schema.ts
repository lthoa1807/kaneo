import { z } from "../openapi";

export const createIntakeRequestBody = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional(),
});
