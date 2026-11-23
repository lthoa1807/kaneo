import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";
import type {
  ProjectFieldTableParams,
  ProjectFieldTableResponse,
} from "@/components/project-fields/types";
import { normalizeProjectFieldTableParams } from "@/lib/project-field-query-keys";

async function getProjectFieldTable(
  workspaceId: string,
  params: Partial<ProjectFieldTableParams> = {},
) {
  const normalized = normalizeProjectFieldTableParams(params);
  const response = await client["project-field"].table[":workspaceId"].$get({
    param: { workspaceId },
    query: {
      filters: normalized.filters.length
        ? JSON.stringify(normalized.filters)
        : undefined,
      sort: normalized.sort.length
        ? JSON.stringify(normalized.sort)
        : undefined,
      limit: String(normalized.limit),
      offset: String(normalized.page * normalized.limit),
      includeArchived: normalized.includeArchived ? "true" : "false",
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return (await response.json()) as ProjectFieldTableResponse;
}

export default getProjectFieldTable;
