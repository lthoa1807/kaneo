import { useQuery } from "@tanstack/react-query";

import type { ProjectFieldWithValue } from "@/components/project-fields/types";
import getProjectFieldValues from "@/fetchers/project-field/get-project-field-values";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useProjectFieldValues(projectId: string | undefined) {
  return useQuery<ProjectFieldWithValue[]>({
    queryKey: projectFieldKeys.values(projectId ?? ""),
    queryFn: () => getProjectFieldValues(projectId as string),
    enabled: Boolean(projectId),
  });
}

export default useProjectFieldValues;
