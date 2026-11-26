import {
  WORKSPACE_CAPABILITY_NAMES,
  type WorkspaceCapability,
} from "@kaneo/permissions";
import { PROJECT_ACCESS_MODES } from "../project-access/project-access-mode";
import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import { BUCKET_ITEM_LIMIT, DUE_SOON_DAYS } from "./dashboard-series";

export const workspaceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    logo: z.string().nullable(),
    description: z.string().nullable(),
    createdAt: responseTimestamp,
    role: z.string().nullable().openapi({
      description:
        "The caller's workspace role: a built-in role (owner, admin, member, viewer) or the name of a custom role defined in the workspace. Several roles are comma-separated, for example owner,viewer. Null when an instance admin views a workspace they are not a member of.",
    }),
  })
  .openapi("Workspace");

export const workspaceListSchema = z.array(workspaceSchema);

export const workspaceMemberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
    role: z.string().openapi({
      description:
        "The member's workspace role: a built-in role (owner, admin, member, viewer) or the name of a custom role defined in the workspace. Several roles are comma-separated, for example owner,viewer.",
    }),
  })
  .openapi("WorkspaceMember");

export const workspaceMemberListSchema = z.array(workspaceMemberSchema);

export const memberProjectAccessSchema = z
  .object({
    userId: z.string(),
    projectAccess: z.enum(PROJECT_ACCESS_MODES),
    projectIds: z.array(z.string()),
  })
  .openapi("MemberProjectAccess");

export const memberProjectAccessListSchema = z
  .array(memberProjectAccessSchema)
  .openapi({
    description:
      "Members limited to selected projects. Members not listed can access every project. Project IDs only include projects the caller can access.",
  });

const capabilityShape = Object.fromEntries(
  WORKSPACE_CAPABILITY_NAMES.map((name) => [name, z.boolean()]),
) as Record<WorkspaceCapability, z.ZodBoolean>;

export const workspaceCapabilitiesSchema = z
  .object(capabilityShape)
  .openapi("WorkspaceCapabilities", {
    description:
      "Whether the caller's roles (and API key scope, if any) allow each named action in the workspace. Mirrors the checks the API enforces.",
  });

export const workspaceMembershipSchema = z
  .object({
    workspaceName: z.string().openapi({
      description:
        "Display name of the workspace, so a guest who cannot read the workspace list still shows it.",
    }),
    kind: z.enum(["guest", "staff"]).openapi({
      description:
        "The caller's membership kind: guest for a guest member, staff for every other member and for instance admins who are not members.",
    }),
    role: z.string().nullable().openapi({
      description:
        "The caller's stored role names, comma-separated. Null when the caller is an instance admin without a membership.",
    }),
  })
  .openapi("WorkspaceMembership", {
    description:
      "The caller's own membership in the workspace. Guests hold no workspace:* permission, so this is the only answer they can read.",
  });
const dashboardTaskShape = {
  id: z.string(),
  ticket: z.string().openapi({
    description: "Project key and task number, e.g. BILL-12.",
  }),
  title: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  priority: z.string().openapi({
    description: "One of: no-priority, low, medium, high, urgent.",
  }),
  dueDate: nullableResponseTimestamp,
};

const dashboardTaskSchema = z
  .object(dashboardTaskShape)
  .openapi("DashboardTask");

const dashboardBucketShape = {
  total: z.number().int().nonnegative().openapi({
    description: "Exact number of matching tasks, independent of items.length.",
  }),
  items: z
    .array(dashboardTaskSchema)
    .max(BUCKET_ITEM_LIMIT)
    .openapi({ description: "First page of matching tasks, at most 50." }),
  truncated: z.boolean().openapi({
    description: "True when total is larger than items.length.",
  }),
};

export const dashboardBucketSchema = z
  .object(dashboardBucketShape)
  .openapi("DashboardTaskBucket");

export const dashboardTaskCountsSchema = z
  .object({
    mineOverdue: dashboardBucketSchema,
    overdueUrgent: dashboardBucketSchema,
    dueSoon: z.object({
      ...dashboardBucketShape,
      urgent: z.number().int().nonnegative(),
      withinDays: z.literal(DUE_SOON_DAYS),
    }),
    unassigned: dashboardBucketSchema,
  })
  .openapi("DashboardTaskCounts");

export const dashboardChartsSchema = z
  .object({
    byPriority: z
      .array(
        z.object({
          priority: z.enum(["urgent", "high", "medium", "low", "no-priority"]),
          count: z.number().int().nonnegative(),
        }),
      )
      .length(5),
    dueByDay: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          count: z.number().int().nonnegative(),
          urgent: z.number().int().nonnegative(),
        }),
      )
      .length(7),
    byProject: z.array(
      z.object({
        projectId: z.string(),
        name: z.string(),
        count: z.number().int().nonnegative(),
      }),
    ),
  })
  .openapi("DashboardCharts");

export const workspaceDashboardSchema = z
  .object({
    generatedAt: responseTimestamp,
    tasks: dashboardTaskCountsSchema,
    charts: dashboardChartsSchema,
  })
  .openapi("WorkspaceDashboard");
