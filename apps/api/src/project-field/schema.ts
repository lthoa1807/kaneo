import { z } from "../openapi";
import { PROJECT_FIELD_TYPES } from "./types";

export const projectFieldTypeSchema = z.enum(PROJECT_FIELD_TYPES);

const calendarUnitSchema = z.enum(["day", "month"]);

export const projectFieldFormulaSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("date_diff"),
    fromFieldId: z.string().min(1),
    toFieldId: z.string().min(1),
    unit: calendarUnitSchema,
  }),
  z.object({
    kind: z.literal("date_add"),
    fromFieldId: z.string().min(1),
    amount: z.number().finite().int(),
    unit: calendarUnitSchema,
  }),
  z.object({
    kind: z.literal("number"),
    op: z.enum(["add", "subtract", "multiply", "divide"]),
    leftFieldId: z.string().min(1),
    rightFieldId: z.string().min(1),
  }),
]);

export const workspaceIdParam = z.object({ workspaceId: z.string().min(1) });
export const projectFieldIdParam = z.object({ id: z.string().min(1) });

export const projectIdParam = z.object({ projectId: z.string().min(1) });

export const setProjectFieldValueBody = z.object({
  fieldId: z.string().min(1),
  value: z.string().nullable(),
});

export const createProjectFieldBody = z.object({
  workspaceId: z.string().min(1),
  name: z.string(),
  type: projectFieldTypeSchema,
  required: z.boolean().optional().default(false),
  defaultValue: z.string().nullable().optional(),
  options: z.array(z.string()).optional(),
  formula: projectFieldFormulaSchema.nullable().optional(),
});

export const updateProjectFieldBody = z.object({
  name: z.string().optional(),
  type: projectFieldTypeSchema.optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
  options: z.array(z.string()).optional(),
  hiddenOptions: z.array(z.string()).optional(),
  formula: projectFieldFormulaSchema.nullable().optional(),
});

export const reorderProjectFieldsBody = z.object({
  fields: z.array(
    z.object({
      id: z.string().min(1),
      position: z.number().int().min(0),
    }),
  ),
});

export const projectFieldTableQuery = z.object({
  filters: z.string().optional(),
  sort: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  includeArchived: z.enum(["true", "false"]).optional().default("false"),
});

export const projectFieldTableFilter = z.object({
  fieldId: z.string().min(1),
  operator: z.string().min(1),
  value: z.union([z.string(), z.array(z.string().min(1)).min(1)]).optional(),
});

export const projectFieldTableSort = z.object({
  key: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});

export const projectFieldTableFilters = z
  .array(projectFieldTableFilter)
  .max(20);
export const projectFieldTableSorts = z.array(projectFieldTableSort).max(2);

export const projectFieldExportQuery = projectFieldTableQuery.extend({
  columns: z.string().optional(),
});
