import { eq } from "drizzle-orm";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import db from "../database";
import { projectTable } from "../database/schema";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { workspaceIdParam } from "../workspace/schema";
import createIntakeRequest from "./controllers/create-intake-request";
import getIntakeRequest from "./controllers/get-intake-request";
import listIntakeProjects from "./controllers/list-intake-projects";
import listIntakeRequests from "./controllers/list-intake-requests";
import {
  intakeRequestDetailSchema,
  intakeRequestListSchema,
  intakeRequestSchema,
} from "./response";
import {
  createIntakeRequestBody,
  listIntakeRequestsQuery,
  requestIdParam,
} from "./schema";

const createIntakeRequestRoute = createRoute({
  method: "post",
  operationId: "createIntakeRequest",
  path: "/workspaces/{workspaceId}/intake-requests",
  tags: ["Intake"],
  summary: "Create intake request",
  description:
    "Submit an intake request into an intake-enabled project the caller can access. The creator is the requester on the guest portal.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ intakeRequest: ["create"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createIntakeRequestBody } },
    },
  },
  responses: {
    200: jsonResponse("The created intake request", intakeRequestSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "Missing intakeRequest:create, no access to the project, or intake is disabled for the project",
    ),
    404: errorResponse("Workspace or project not found"),
  },
});

const listIntakeProjectsRoute = createRoute({
  method: "get",
  operationId: "listIntakeProjects",
  path: "/workspaces/{workspaceId}/intake-projects",
  tags: ["Intake"],
  summary: "List intake projects",
  description:
    "The guest submission picker: id and name of every intake-enabled project the caller can access.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ intakeRequest: ["create"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "Intake-enabled accessible projects",
      z.array(z.object({ id: z.string(), name: z.string() })),
    ),
    403: errorResponse("Missing intakeRequest:create permission"),
    404: errorResponse("Workspace not found"),
  },
});

const listIntakeRequestsRoute = createRoute({
  method: "get",
  operationId: "listIntakeRequests",
  path: "/workspaces/{workspaceId}/intake-requests",
  tags: ["Intake"],
  summary: "List intake requests",
  description:
    "Guests see their own requests; manage holders see every request in projects they can access. Each item embeds display-only projectName and linked-task progress counts.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ intakeRequest: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam, query: listIntakeRequestsQuery },
  responses: {
    200: jsonResponse("A page of intake requests", intakeRequestListSchema),
    403: errorResponse("Missing intakeRequest:read permission"),
    404: errorResponse("Workspace not found"),
  },
});

const getIntakeRequestRoute = createRoute({
  method: "get",
  operationId: "getIntakeRequest",
  path: "/requests/{requestId}",
  tags: ["Intake"],
  summary: "Get intake request",
  description:
    "Manage holders see linked tasks and progress; guests (owners only) see the progress counts without task internals. A non-owner guest gets a 404.",
  middleware: [
    workspaceAccess.fromIntakeRequest("requestId"),
    requireWorkspacePermission({ intakeRequest: ["read"] }),
  ] as const,
  request: { params: requestIdParam },
  responses: {
    200: jsonResponse("The intake request", intakeRequestDetailSchema),
    403: errorResponse(
      "Missing intakeRequest:read permission, or no access to the request's project",
    ),
    404: errorResponse("Intake request not found"),
  },
});

const intake = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(listIntakeProjectsRoute, async (c) =>
    c.json(
      await listIntakeProjects(
        c.req.valid("param").workspaceId,
        c.get("userId"),
      ),
      200,
    ),
  )
  .openapi(listIntakeRequestsRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    const { projectId, status, page, limit } = c.req.valid("query");
    return c.json(
      await listIntakeRequests(c, workspaceId, {
        projectId,
        status,
        page,
        limit,
      }),
      200,
    );
  })
  .openapi(getIntakeRequestRoute, async (c) =>
    c.json(await getIntakeRequest(c, c.req.valid("param").requestId), 200),
  )
  .openapi(createIntakeRequestRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    const { projectId, title, description } = c.req.valid("json");
    const row = await createIntakeRequest(
      { projectId, workspaceId, title, description: description ?? null },
      c.get("userId"),
    );
    const [project] = await db
      .select({ name: projectTable.name })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .limit(1);
    return c.json(
      {
        ...row,
        projectName: project?.name ?? "",
        displayId: `REQ-${row.number}`,
      },
      200,
    );
  });

export default intake;
