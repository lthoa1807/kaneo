import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { DrillFilters } from "@/components/dashboard/types";

async function getDashboardTaskDrilldown(
  workspaceId: string,
  filters: DrillFilters,
) {
  const response = await client.workspace[":workspaceId"].dashboard.tasks.$get({
    param: { workspaceId },
    query: {
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      ...(filters.day ? { day: filters.day } : {}),
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getDashboardTaskDrilldown;
