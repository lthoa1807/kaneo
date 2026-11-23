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
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { workspaceIdParam } from "../workspace/schema";
import createIntakeRequest from "./controllers/create-intake-request";
import { intakeRequestSchema } from "./response";
import { createIntakeRequestBody } from "./schema";

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

const intake = apiRouter<BaseVariables & { workspaceId: string }>().openapi(
  createIntakeRequestRoute,
  async (c) => {
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
  },
);

export default intake;
