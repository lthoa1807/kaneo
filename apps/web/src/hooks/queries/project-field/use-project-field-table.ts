import { useQuery } from "@tanstack/react-query";

import type {
  ProjectFieldTableParams,
  ProjectFieldTableResponse,
} from "@/components/project-fields/types";
import getProjectFieldTable from "@/fetchers/project-field/get-project-field-table";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useProjectFieldTable(
  workspaceId: string | undefined,
  params: Partial<ProjectFieldTableParams>,
  enabled = true,
) {
  return useQuery<ProjectFieldTableResponse>({
    queryKey: projectFieldKeys.table(workspaceId ?? "", params),
    queryFn: () => getProjectFieldTable(workspaceId as string, params),
    enabled: Boolean(workspaceId) && enabled,
  });
}

export default useProjectFieldTable;
