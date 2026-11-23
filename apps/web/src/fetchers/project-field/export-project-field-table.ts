import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";
import type { ProjectFieldTableParams } from "@/components/project-fields/types";
import { normalizeProjectFieldTableParams } from "@/lib/project-field-query-keys";

async function exportProjectFieldTable({
  workspaceId,
  params,
  columns,
}: {
  workspaceId: string;
  params: Partial<ProjectFieldTableParams>;
  columns: string[];
}) {
  const normalized = normalizeProjectFieldTableParams(params);
  const response = await client["project-field"].table[
    ":workspaceId"
  ].export.$get({
    param: { workspaceId },
    query: {
      filters: normalized.filters.length
        ? JSON.stringify(normalized.filters)
        : undefined,
      sort: normalized.sort.length
        ? JSON.stringify(normalized.sort)
        : undefined,
      includeArchived: normalized.includeArchived ? "true" : "false",
      columns: columns.join(","),
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  return {
    blob: await response.blob(),
    filename: match?.[1] || `projects-${workspaceId}.csv`,
  };
}

export default exportProjectFieldTable;
