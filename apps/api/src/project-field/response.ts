import { responseTimestamp, z } from "../openapi";
import { projectFieldFormulaSchema, projectFieldTypeSchema } from "./schema";

export const projectFieldDefinitionSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    type: projectFieldTypeSchema,
    required: z.boolean(),
    defaultValue: z.string().nullable(),
    options: z.array(z.string()).nullable(),
    hiddenOptions: z.array(z.string()),
    formula: projectFieldFormulaSchema.nullable(),
    position: z.number(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("ProjectFieldDefinition");

export const projectFieldDefinitionListSchema = z.array(
  projectFieldDefinitionSchema,
);

export const projectFieldWithValueSchema = projectFieldDefinitionSchema
  .extend({
    projectId: z.string(),
    valueId: z.string().nullable(),
    value: z.string().nullable(),
    computedValue: z.string().nullable(),
  })
  .openapi("ProjectFieldWithValue");

export const projectFieldWithValueListSchema = z.array(
  projectFieldWithValueSchema,
);

export const projectFieldValueSchema = z
  .object({
    projectId: z.string(),
    fieldId: z.string(),
    value: z.string().nullable(),
  })
  .openapi("ProjectFieldValue");

export const dependentProjectFormulaSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const projectFieldUsageSchema = z
  .object({
    projectCount: z.number().int().nonnegative(),
    valueCount: z.number().int().nonnegative(),
    dependentFormulaCount: z.number().int().nonnegative(),
    dependentFormulas: z.array(dependentProjectFormulaSchema),
  })
  .openapi("ProjectFieldUsage");

export const projectFieldTableStatisticsSchema = z
  .object({
    completionPercentage: z.number(),
    totalTasks: z.number().int().nonnegative(),
    dueDate: responseTimestamp.nullable(),
  })
  .openapi("ProjectFieldTableStatistics");

export const projectFieldTableProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    icon: z.string().nullable(),
    archivedAt: responseTimestamp.nullable(),
    createdAt: responseTimestamp,
    statistics: projectFieldTableStatisticsSchema,
    values: z.record(z.string(), z.string().nullable()),
    formulas: z.record(z.string(), z.string().nullable()),
  })
  .openapi("ProjectFieldTableProject");

export const projectFieldTableSchema = z
  .object({
    definitions: projectFieldDefinitionListSchema,
    projects: z.array(projectFieldTableProjectSchema),
    total: z.number().int().nonnegative(),
  })
  .openapi("ProjectFieldTable");
