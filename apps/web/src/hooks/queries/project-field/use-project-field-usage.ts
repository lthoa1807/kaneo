import { useQuery } from "@tanstack/react-query";

import type { ProjectFieldUsage } from "@/components/project-fields/types";
import getProjectFieldUsage from "@/fetchers/project-field/get-project-field-usage";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useProjectFieldUsage(fieldId: string | null) {
  return useQuery<ProjectFieldUsage>({
    queryKey: projectFieldKeys.usage(fieldId ?? ""),
    queryFn: () => getProjectFieldUsage(fieldId as string),
    enabled: Boolean(fieldId),
  });
}

export default useProjectFieldUsage;
