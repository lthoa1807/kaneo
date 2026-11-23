import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createProjectField from "./controllers/create-project-field";
import deleteProjectField from "./controllers/delete-project-field";
import getProjectFieldsByProject from "./controllers/get-project-fields-by-project";
import getProjectFieldUsage from "./controllers/get-project-field-usage";
import getProjectFieldsByWorkspace from "./controllers/get-project-fields-by-workspace";
import exportProjectFieldTable from "./controllers/export-project-field-table";
import getProjectFieldTable from "./controllers/get-project-field-table";
import reorderProjectFields from "./controllers/reorder-project-fields";
import setProjectFieldValue from "./controllers/set-project-field-value";
import updateProjectField from "./controllers/update-project-field";
import {
  projectFieldDefinitionListSchema,
  projectFieldDefinitionSchema,
  projectFieldTableSchema,
  projectFieldUsageSchema,
  projectFieldValueSchema,
  projectFieldWithValueListSchema,
} from "./response";
import {
  createProjectFieldBody,
  projectFieldIdParam,
  projectFieldExportQuery,
  projectFieldTableQuery,
  projectIdParam,
  reorderProjectFieldsBody,
  setProjectFieldValueBody,
  updateProjectFieldBody,
  workspaceIdParam,
} from "./schema";

const listProjectFieldsRoute = createRoute({
  method: "get",
  operationId: "listProjectFields",
  path: "/workspace/{workspaceId}",
  tags: ["Project Fields"],
  summary: "List workspace project fields",
  description: "List project field definitions in workspace display order.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "Ordered project field definitions",
      projectFieldDefinitionListSchema,
    ),
    403: errorResponse("Missing workspace:read permission"),
    404: errorResponse("Workspace not found"),
  },
});

const createProjectFieldRoute = createRoute({
  method: "post",
  operationId: "createProjectField",
  path: "/",
  tags: ["Project Fields"],
  summary: "Create project field",
  description: "Create a workspace-wide project field definition.",
  middleware: [
    workspaceAccess.fromBody("workspaceId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createProjectFieldBody } },
    },
  },
  responses: {
    200: jsonResponse("Created project field", projectFieldDefinitionSchema),
    400: errorResponse("Invalid project field definition"),
    403: errorResponse("Missing workspace:manage_settings permission"),
    404: errorResponse("Workspace not found"),
    409: errorResponse("A project field with this name already exists"),
  },
});

const getProjectFieldsByProjectRoute = createRoute({
  method: "get",
  operationId: "getProjectFieldsByProject",
  path: "/project/{projectId}",
  tags: ["Project Fields"],
  summary: "Get project field values",
  description:
    "List workspace project fields with this project's stored and computed values.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["read"] }),
  ] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse(
      "Project fields with values",
      projectFieldWithValueListSchema,
    ),
    403: errorResponse("No access to the project, or missing read permission"),
    404: errorResponse("Project not found"),
  },
});

const setProjectFieldValueRoute = createRoute({
  method: "put",
  operationId: "setProjectFieldValue",
  path: "/project/{projectId}/value",
  tags: ["Project Fields"],
  summary: "Set a project field value",
  description:
    "Store or clear one field value for a project. Formula fields are read-only.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: setProjectFieldValueBody } },
    },
  },
  responses: {
    200: jsonResponse("Stored project field value", projectFieldValueSchema),
    400: errorResponse("Invalid value for this project field"),
    403: errorResponse(
      "No access to the project, or missing update permission",
    ),
    404: errorResponse("Project or project field not found"),
  },
});

const getProjectFieldTableRoute = createRoute({
  method: "get",
  operationId: "getProjectFieldTable",
  path: "/table/{workspaceId}",
  tags: ["Project Fields"],
  summary: "Get the project fields table",
  description:
    "List one access-scoped page of projects with filtered, sorted project field values and computed formulas.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ project: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam, query: projectFieldTableQuery },
  responses: {
    200: jsonResponse("Project fields table page", projectFieldTableSchema),
    400: errorResponse("Invalid filters, sort, or pagination"),
    403: errorResponse("Missing project:read permission"),
    404: errorResponse("Workspace not found"),
  },
});

const exportProjectFieldTableRoute = createRoute({
  method: "get",
  operationId: "exportProjectFieldTable",
  path: "/table/{workspaceId}/export",
  tags: ["Project Fields"],
  summary: "Export the project fields table as CSV",
  description:
    "Export the access-scoped project fields table as UTF-8 CSV with the same filters, sort, and archived toggle.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ project: ["read"] }),
  ] as const,
  request: { params: workspaceIdParam, query: projectFieldExportQuery },
  responses: {
    200: {
      description: "UTF-8 CSV with a BOM",
      content: { "text/csv": { schema: z.string() } },
    },
    400: errorResponse(
      "Invalid filters, sort, columns, or more than 20,000 rows",
    ),
    403: errorResponse("Missing project:read permission"),
    404: errorResponse("Workspace not found"),
  },
});

const reorderProjectFieldsRoute = createRoute({
  method: "put",
  operationId: "reorderProjectFields",
  path: "/reorder/{workspaceId}",
  tags: ["Project Fields"],
  summary: "Reorder project fields",
  description: "Set project field positions within a workspace.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: reorderProjectFieldsBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "Reordered project field definitions",
      projectFieldDefinitionListSchema,
    ),
    400: errorResponse("A field does not belong to this workspace"),
    403: errorResponse("Missing workspace:manage_settings permission"),
    404: errorResponse("Workspace not found"),
  },
});

const getProjectFieldUsageRoute = createRoute({
  method: "get",
  operationId: "getProjectFieldUsage",
  path: "/{id}/usage",
  tags: ["Project Fields"],
  summary: "Get project field usage",
  description:
    "Get project/value counts and formulas that depend on this field.",
  middleware: [
    workspaceAccess.fromProjectField("id"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: { params: projectFieldIdParam },
  responses: {
    200: jsonResponse("Project field usage", projectFieldUsageSchema),
    403: errorResponse("Missing workspace:manage_settings permission"),
    404: errorResponse("Project field not found"),
  },
});

const updateProjectFieldRoute = createRoute({
  method: "put",
  operationId: "updateProjectField",
  path: "/{id}",
  tags: ["Project Fields"],
  summary: "Update project field",
  description:
    "Update a project field definition. Only dropdown and multiselect may switch types.",
  middleware: [
    workspaceAccess.fromProjectField("id"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: {
    params: projectFieldIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateProjectFieldBody } },
    },
  },
  responses: {
    200: jsonResponse("Updated project field", projectFieldDefinitionSchema),
    400: errorResponse("Invalid project field update"),
    403: errorResponse("Missing workspace:manage_settings permission"),
    404: errorResponse("Project field not found"),
    409: errorResponse("A project field with this name already exists"),
  },
});

const deleteProjectFieldRoute = createRoute({
  method: "delete",
  operationId: "deleteProjectField",
  path: "/{id}",
  tags: ["Project Fields"],
  summary: "Delete project field",
  description:
    "Delete a project field and its values unless a formula depends on it.",
  middleware: [
    workspaceAccess.fromProjectField("id"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: { params: projectFieldIdParam },
  responses: {
    200: jsonResponse("Deleted project field", projectFieldDefinitionSchema),
    403: errorResponse("Missing workspace:manage_settings permission"),
    404: errorResponse("Project field not found"),
    409: errorResponse("A formula depends on this field"),
  },
});

const projectField = apiRouter()
  .openapi(getProjectFieldsByProjectRoute, async (c) =>
    c.json(
      await getProjectFieldsByProject(c.req.valid("param").projectId),
      200,
    ),
  )
  .openapi(setProjectFieldValueRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const { fieldId, value } = c.req.valid("json");
    const result = await setProjectFieldValue({ projectId, fieldId, value });
    return c.json(
      {
        projectId: result.projectId,
        fieldId: result.fieldId,
        value: result.value,
      },
      200,
    );
  })
  .openapi(getProjectFieldTableRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    const query = c.req.valid("query");
    return c.json(
      await getProjectFieldTable({
        workspaceId,
        userId: c.get("userId"),
        filters: query.filters,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
        includeArchived: query.includeArchived === "true",
      }),
      200,
    );
  })
  .openapi(exportProjectFieldTableRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    const query = c.req.valid("query");
    const { csv, filename } = await exportProjectFieldTable({
      workspaceId,
      userId: c.get("userId"),
      filters: query.filters,
      sort: query.sort,
      limit: 500,
      offset: 0,
      includeArchived: query.includeArchived === "true",
      columns: query.columns,
    });
    const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "");
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
    });
  })
  .openapi(listProjectFieldsRoute, async (c) =>
    c.json(
      await getProjectFieldsByWorkspace(c.req.valid("param").workspaceId),
      200,
    ),
  )
  .openapi(createProjectFieldRoute, async (c) =>
    c.json(await createProjectField(c.req.valid("json")), 200),
  )
  .openapi(reorderProjectFieldsRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    const { fields } = c.req.valid("json");
    return c.json(await reorderProjectFields(workspaceId, fields), 200);
  })
  .openapi(getProjectFieldUsageRoute, async (c) =>
    c.json(await getProjectFieldUsage(c.req.valid("param").id), 200),
  )
  .openapi(updateProjectFieldRoute, async (c) =>
    c.json(
      await updateProjectField(c.req.valid("param").id, c.req.valid("json")),
      200,
    ),
  )
  .openapi(deleteProjectFieldRoute, async (c) =>
    c.json(await deleteProjectField(c.req.valid("param").id), 200),
  );

export default projectField;
