import type { QueryClient } from "@tanstack/react-query";

import { projectFieldKeys } from "@/lib/project-field-query-keys";

export function invalidateProjectFieldTables(
  queryClient: QueryClient,
  workspaceId: string | undefined,
) {
  return queryClient.invalidateQueries({
    queryKey: workspaceId
      ? projectFieldKeys.tableAll(workspaceId)
      : projectFieldKeys.tablePrefix,
  });
}

export function invalidateProjectFieldValues(
  queryClient: QueryClient,
  projectId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: projectFieldKeys.values(projectId),
  });
}
