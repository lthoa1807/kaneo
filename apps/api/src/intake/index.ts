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
import {
  validateAndParseDate,
  validateDateRange,
} from "../utils/validate-dates";
import { createTaskBody } from "../task/schema";
import { taskSchema } from "../task/response";
import createIntakeRequest from "./controllers/create-intake-request";
import attachIntakeTask from "./controllers/attach-intake-task";
import getIntakeRequest from "./controllers/get-intake-request";
import listIntakeActivity from "./controllers/list-intake-activity";
import listIntakeProjects from "./controllers/list-intake-projects";
import listIntakeRequests from "./controllers/list-intake-requests";
import updateIntakeRequest from "./controllers/update-intake-request";
import transitionIntakeRequest from "./controllers/transition-intake-request";
import {
  intakeActivityListSchema,
  intakeRequestDetailSchema,
  intakeRequestListSchema,
  intakeRequestSchema,
} from "./response";
import {
  createIntakeRequestBody,
  listIntakeRequestsQuery,
  requestIdParam,
  transitionIntakeRequestBody,
  updateIntakeRequestBody,
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

const updateIntakeRequestRoute = createRoute({
  method: "patch",
  operationId: "updateIntakeRequest",
  path: "/requests/{requestId}",
  tags: ["Intake"],
  summary: "Update intake request",
  description:
    "Owner-only edits while the request is new: fix title and description typos. Status is not patchable; later stages go through transitions.",
  middleware: [
    workspaceAccess.fromIntakeRequest("requestId"),
    requireWorkspacePermission({ intakeRequest: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: requestIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateIntakeRequestBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated intake request", intakeRequestSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse("Missing intakeRequest:update permission"),
    404: errorResponse("Intake request not found"),
    409: errorResponse("Only new requests can be edited"),
  },
});

const transitionIntakeRequestRoute = createRoute({
  method: "post",
  operationId: "transitionIntakeRequest",
  path: "/requests/{requestId}/transition",
  tags: ["Intake"],
  summary: "Transition intake request",
  description:
    "Move an intake request through its lifecycle: staff triage and work it, the guest owner confirms or requests revision. Illegal moves, terminal states, and lost races return 409 with the current status.",
  middleware: [
    workspaceAccess.fromIntakeRequest("requestId"),
    requireWorkspacePermission({ intakeRequest: ["update"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: requestIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: transitionIntakeRequestBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated intake request", intakeRequestSchema),
    400: errorResponse("Invalid body, or a required note is missing"),
    403: errorResponse("Missing intakeRequest:update permission"),
    404: errorResponse("Intake request not found"),
    409: errorResponse(
      "Transition not allowed from the current status, or it was changed concurrently",
    ),
  },
});

const listIntakeActivityRoute = createRoute({
  method: "get",
  operationId: "listIntakeActivity",
  path: "/requests/{requestId}/activity",
  tags: ["Intake"],
  summary: "List intake request activity",
  description:
    "The activity trail, newest first. Guests (owners only) see lifecycle entries; manage holders see everything including task links.",
  middleware: [
    workspaceAccess.fromIntakeRequest("requestId"),
    requireWorkspacePermission({ intakeRequest: ["read"] }),
  ] as const,
  request: { params: requestIdParam },
  responses: {
    200: jsonResponse("The activity trail", intakeActivityListSchema),
    403: errorResponse("Missing intakeRequest:read permission"),
    404: errorResponse("Intake request not found"),
  },
});

const attachIntakeTaskRoute = createRoute({
  method: "post",
  operationId: "attachIntakeTask",
  path: "/requests/{requestId}/tasks",
  tags: ["Intake"],
  summary: "Attach task to intake request",
  description:
    "Create the task that fulfils an intake request — same body as task creation — and link it to the request. Only while the request is approved, in progress, or needs revision.",
  middleware: [
    workspaceAccess.fromIntakeRequest("requestId"),
    requireWorkspacePermission({ intakeRequest: ["manage"], task: ["create"] }),
    requireEntitlement,
  ] as const,
  request: {
    params: requestIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createTaskBody } },
    },
  },
  responses: {
    200: jsonResponse("The created task", taskSchema),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "Missing intakeRequest:manage or task:create permission",
    ),
    404: errorResponse("Intake request not found"),
    409: errorResponse(
      "Tasks can only be attached while approved, in progress, or needs revision",
    ),
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
  .openapi(listIntakeActivityRoute, async (c) =>
    c.json(await listIntakeActivity(c, c.req.valid("param").requestId), 200),
  )
  .openapi(updateIntakeRequestRoute, async (c) => {
    const { requestId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await updateIntakeRequest(c, requestId, body), 200);
  })
  .openapi(transitionIntakeRequestRoute, async (c) => {
    const { requestId } = c.req.valid("param");
    const { to, note } = c.req.valid("json");
    return c.json(
      await transitionIntakeRequest(c, requestId, { to, note }),
      200,
    );
  })
  .openapi(attachIntakeTaskRoute, async (c) => {
    const { requestId } = c.req.valid("param");
    const body = c.req.valid("json");
    const startDate =
      body.startDate !== undefined
        ? validateAndParseDate(body.startDate, "startDate")
        : undefined;
    const dueDate =
      body.dueDate !== undefined
        ? validateAndParseDate(body.dueDate, "dueDate")
        : undefined;
    validateDateRange(startDate, dueDate);
    const task = await attachIntakeTask(c, requestId, {
      ...body,
      startDate,
      dueDate,
    });
    return c.json(task, 200);
  })
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
