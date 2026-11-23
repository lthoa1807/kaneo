import { useMutation, useQueryClient } from "@tanstack/react-query";

import deleteProjectField from "@/fetchers/project-field/delete-project-field";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useDeleteProjectField(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProjectField,
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

export default useDeleteProjectField;
