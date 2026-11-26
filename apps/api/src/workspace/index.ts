import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { listWorkspaceProjectAccess } from "../project-access/list-workspace-project-access";
import {
  requireApiKeyScope,
  requireWorkspacePermission,
  workspacePermissionChecker,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getDashboardSummaryCtrl from "./controllers/get-dashboard-summary";
import getDashboardTaskDrilldownCtrl from "./controllers/get-dashboard-task-drilldown";
import getMyCapabilitiesCtrl from "./controllers/get-my-capabilities";
import getMyMembershipCtrl from "./controllers/get-my-membership";
import getMyProjectAccessCtrl from "./controllers/get-my-project-access";
import getWorkspaceCtrl from "./controllers/get-workspace";
import getWorkspaceMembersCtrl from "./controllers/get-workspace-members";
import listWorkspacesCtrl from "./controllers/list-workspaces";
import updateMemberProjectAccessCtrl from "./controllers/update-member-project-access";
import {
  memberProjectAccessListSchema,
  memberProjectAccessSchema,
  dashboardBucketSchema,
  workspaceCapabilitiesSchema,
  workspaceDashboardSchema,
  workspaceListSchema,
  workspaceMemberListSchema,
  workspaceMembershipSchema,
  workspaceSchema,
} from "./response";
import {
  dashboardDrilldownQuery,
  updateMemberProjectAccessBody,
  workspaceIdParam,
  workspaceMemberParam,
  workspaceMembersQuery,
} from "./schema";

const listWorkspacesRoute = createRoute({
  method: "get",
  operationId: "listWorkspaces",
  path: "/",
  tags: ["Workspaces"],
  summary: "List workspaces",
  description:
    "List the workspaces where one of the caller's roles grants workspace:read, with the caller's role, sorted by name. Instance admins get every workspace they are a member of, and only those. Archived workspaces are left out.",
  middleware: [requireApiKeyScope({ workspace: ["read"] })] as const,
  responses: {
    200: jsonResponse("The caller's workspaces", workspaceListSchema),
    403: errorResponse("The API key lacks workspace:read"),
  },
});

const getWorkspaceRoute = createRoute({
  method: "get",
  operationId: "getWorkspace",
  path: "/{workspaceId}",
  tags: ["Workspaces"],
  summary: "Get workspace",
  description:
    "Get a workspace where one of the caller's roles grants workspace:read, with the caller's role. Instance admins can get any workspace, with a null role when they are not a member. An archived workspace returns 403 with the code WORKSPACE_ARCHIVED to anyone who could otherwise read it.",
  middleware: [requireApiKeyScope({ workspace: ["read"] })] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("The workspace", workspaceSchema),
    403: errorResponse(
      "The API key lacks workspace:read, or the workspace is archived (code WORKSPACE_ARCHIVED)",
    ),
    404: errorResponse(
      "Workspace not found, the caller is not a member of it, or none of their roles grants workspace:read",
    ),
  },
});

const getWorkspaceDashboardTasksRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceDashboardTasks",
  path: "/{workspaceId}/dashboard/tasks",
  tags: ["Workspaces"],
  summary: "Get dashboard task bucket",
  description:
    "First 50 tasks behind one dashboard chart segment, filtered by priority, project or due day. Same scope and ordering as the dashboard counts: readable, non-archived projects, open tasks only.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam, query: dashboardDrilldownQuery },
  responses: {
    200: jsonResponse("One task bucket", dashboardBucketSchema),
    400: errorResponse("Invalid priority or day"),
    403: errorResponse(
      "Missing project:read or task:read, or no access to the workspace",
    ),
    404: errorResponse("Workspace not found"),
  },
});

const getWorkspaceDashboardRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceDashboard",
  path: "/{workspaceId}/dashboard",
  tags: ["Workspaces"],
  summary: "Get workspace dashboard",
  description:
    "Task buckets and chart aggregates for the Overview page: the caller's overdue tasks, overdue urgent tasks, tasks due within three days, unassigned tasks, plus open tasks by priority, by due day and by project. Every count and every row only covers tasks in readable, non-archived projects and leaves out tasks whose status is done or archived.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ project: ["read"], task: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "Task buckets and chart aggregates for the dashboard",
      workspaceDashboardSchema,
    ),
    403: errorResponse(
      "Missing project:read or task:read, or no access to the workspace",
    ),
    404: errorResponse("Workspace not found"),
  },
});

const getWorkspaceMembersRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceMembers",
  path: "/{workspaceId}/members",
  tags: ["Workspaces"],
  summary: "Get workspace members",
  description:
    "Get all members of a workspace, with their role. Pass projectId to get only the members who can access that project.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam, query: workspaceMembersQuery },
  responses: {
    200: jsonResponse("List of workspace members", workspaceMemberListSchema),
    403: errorResponse("No access to the project, or missing read permission"),
    404: errorResponse(
      "Workspace not found, or project not found in this workspace",
    ),
  },
});

const getWorkspaceProjectAccessRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceProjectAccess",
  path: "/{workspaceId}/project-access",
  tags: ["Workspaces"],
  summary: "Get member project access",
  description:
    "List the members who are limited to selected projects, with the projects each one can access. Everyone else in the workspace can access every project. A caller whose own access is limited only sees the projects they can access.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ member: ["update"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "Members limited to selected projects",
      memberProjectAccessListSchema,
    ),
    403: errorResponse("Missing member:update permission"),
    404: errorResponse("Workspace not found"),
  },
});

const getMyProjectAccessRoute = createRoute({
  method: "get",
  operationId: "getMyProjectAccess",
  path: "/{workspaceId}/project-access/me",
  tags: ["Workspaces"],
  summary: "Get my project access",
  description:
    "Get the caller's own project access in the workspace: every project, or the selected projects they're limited to. Owners and instance admins always get every project.",
  middleware: [workspaceAccess.fromParam("workspaceId")] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("The caller's project access", memberProjectAccessSchema),
    404: errorResponse("Workspace not found"),
  },
});

const getMyCapabilitiesRoute = createRoute({
  method: "get",
  operationId: "getMyWorkspaceCapabilities",
  path: "/{workspaceId}/capabilities",
  tags: ["Workspaces"],
  summary: "Get my workspace capabilities",
  description:
    "Check every named workspace action for the caller in one request: which of them the caller's roles allow, narrowed by the API key's scope when one is used. Instance admins are allowed everything.",
  middleware: [workspaceAccess.fromParam("workspaceId")] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "The caller's capabilities in the workspace",
      workspaceCapabilitiesSchema,
    ),
    404: errorResponse("Workspace not found"),
  },
});

const getMyMembershipRoute = createRoute({
  method: "get",
  operationId: "getMyWorkspaceMembership",
  path: "/{workspaceId}/membership",
  tags: ["Workspaces"],
  summary: "Get my workspace membership",
  description:
    "Answer whether the caller is a guest or a staff member of the workspace. Separate from capabilities because guests hold no workspace:read and capabilities only decide what the UI may do, not who the caller is.",
  middleware: [workspaceAccess.fromParam("workspaceId")] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "The caller's membership kind and role",
      workspaceMembershipSchema,
    ),
    404: errorResponse("Workspace not found"),
  },
});

const updateMemberProjectAccessRoute = createRoute({
  method: "put",
  operationId: "updateMemberProjectAccess",
  path: "/{workspaceId}/members/{userId}/project-access",
  tags: ["Workspaces"],
  summary: "Update member project access",
  description:
    "Give a member access to every project, or limit them to selected projects. Owners always access every project, and you can't change your own access or give access to projects you can't access yourself.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ member: ["update"] }),
  ] as const,
  request: {
    params: workspaceMemberParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: updateMemberProjectAccessBody },
      },
    },
  },
  responses: {
    200: jsonResponse("The member's project access", memberProjectAccessSchema),
    400: errorResponse(
      "Invalid body, the member is an owner, or a project is not in this workspace",
    ),
    403: errorResponse(
      "Missing member:update permission, changing your own access, or granting a project you can't access",
    ),
    404: errorResponse("Workspace or member not found"),
  },
});

const workspace = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(listWorkspacesRoute, async (c) =>
    c.json(await listWorkspacesCtrl(c.get("userId")), 200),
  )
  .openapi(getWorkspaceRoute, async (c) =>
    c.json(
      await getWorkspaceCtrl(c.req.valid("param").workspaceId, c.get("userId")),
      200,
    ),
  )
  .openapi(getWorkspaceDashboardRoute, async (c) =>
    c.json(
      await getDashboardSummaryCtrl({
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
      }),
      200,
    ),
  )
  .openapi(getWorkspaceDashboardTasksRoute, async (c) =>
    c.json(
      await getDashboardTaskDrilldownCtrl({
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
        ...c.req.valid("query"),
      }),
      200,
    ),
  )
  .openapi(getWorkspaceMembersRoute, async (c) =>
    c.json(
      await getWorkspaceMembersCtrl({
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
        projectId: c.req.valid("query").projectId,
        assignable: c.req.valid("query").assignable === "true",
      }),
      200,
    ),
  )
  .openapi(getMyProjectAccessRoute, async (c) =>
    c.json(
      await getMyProjectAccessCtrl(c.get("workspaceId"), c.get("userId")),
      200,
    ),
  )
  .openapi(getMyCapabilitiesRoute, async (c) =>
    c.json(getMyCapabilitiesCtrl(await workspacePermissionChecker(c)), 200),
  )
  .openapi(getMyMembershipRoute, async (c) =>
    c.json(
      await getMyMembershipCtrl(c.get("workspaceId"), c.get("userId")),
      200,
    ),
  )
  .openapi(getWorkspaceProjectAccessRoute, async (c) =>
    c.json(
      await listWorkspaceProjectAccess(c.get("workspaceId"), c.get("userId")),
      200,
    ),
  )
  .openapi(updateMemberProjectAccessRoute, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(
      await updateMemberProjectAccessCtrl({
        workspaceId: c.get("workspaceId"),
        actorId: c.get("userId"),
        userId,
        projectAccess: body.projectAccess,
        projectIds: body.projectIds,
      }),
      200,
    );
  });

export default workspace;
