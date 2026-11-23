import { useMutation, useQueryClient } from "@tanstack/react-query";

import reorderProjectFields from "@/fetchers/project-field/reorder-project-fields";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useReorderProjectFields(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderProjectFields,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectFieldKeys.definitions(workspaceId),
      });
      void queryClient.invalidateQueries({
        queryKey: projectFieldKeys.tableAll(workspaceId),
      });
      void queryClient.invalidateQueries({
        queryKey: projectFieldKeys.valuesAll,
      });
    },
  });
}

export default useReorderProjectFields;
