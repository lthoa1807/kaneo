import { useQuery } from "@tanstack/react-query";

import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import getProjectFields from "@/fetchers/project-field/get-project-fields";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useProjectFields(workspaceId: string | undefined) {
  return useQuery<ProjectFieldDefinition[]>({
    queryKey: projectFieldKeys.definitions(workspaceId ?? ""),
    queryFn: () => getProjectFields(workspaceId as string),
    enabled: Boolean(workspaceId),
  });
}

export default useProjectFields;
