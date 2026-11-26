import { PROJECT_ACCESS_MODES } from "../project-access/project-access-mode";
import { z } from "../openapi";

export const workspaceIdParam = z.object({ workspaceId: z.string() });

export const workspaceMemberParam = z.object({
  workspaceId: z.string(),
  userId: z.string(),
});

export const workspaceMembersQuery = z.object({
  projectId: z.string().optional().openapi({
    description:
      "Only return members who can access this project, for example to fill an assignee picker.",
  }),
  assignable: z.enum(["true", "false"]).optional().openapi({
    description:
      "Set to true to leave out guests, who receive work through intake requests and can never be assigned a task.",
  }),
});

export const updateMemberProjectAccessBody = z.object({
  projectAccess: z.enum(PROJECT_ACCESS_MODES).openapi({
    description:
      '"all" gives access to every project in the workspace, including future ones. "selected" limits the member to projectIds.',
  }),
  projectIds: z.array(z.string()).default([]).openapi({
    description:
      'Projects the member can access when projectAccess is "selected".',
  }),
});

export const dashboardDrilldownQuery = z.object({
  priority: z
    .enum(["no-priority", "low", "medium", "high", "urgent"])
    .optional()
    .openapi({ description: "Only tasks with this priority." }),
  projectId: z
    .string()
    .optional()
    .openapi({ description: "Only tasks in this project." }),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .openapi({ description: "Only tasks due on this UTC day (YYYY-MM-DD)." }),
});
