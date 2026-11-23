import type { ProjectFieldTableParams } from "@/components/project-fields/types";

export function normalizeProjectFieldTableParams(
  params: Partial<ProjectFieldTableParams> = {},
): ProjectFieldTableParams {
  return {
    filters: params.filters?.filter(Boolean) ?? [],
    sort: params.sort?.filter(Boolean) ?? [],
    page: Math.max(0, params.page ?? 0),
    limit: params.limit ?? 50,
    includeArchived: params.includeArchived ?? false,
  };
}

export const projectFieldKeys = {
  all: ["project-fields"] as const,
  definitions: (workspaceId: string) =>
    ["project-fields", workspaceId] as const,
  usage: (fieldId: string) => ["project-field-usage", fieldId] as const,
  values: (projectId: string) => ["project-field-values", projectId] as const,
  valuesAll: ["project-field-values"] as const,
  table: (workspaceId: string, params?: Partial<ProjectFieldTableParams>) =>
    [
      "project-field-table",
      workspaceId,
      normalizeProjectFieldTableParams(params),
    ] as const,
  tableAll: (workspaceId: string) =>
    ["project-field-table", workspaceId] as const,
  tablePrefix: ["project-field-table"] as const,
};

export function projectFieldValueKeyPrefix(projectId: string) {
  return ["project-field-values", projectId] as const;
}
