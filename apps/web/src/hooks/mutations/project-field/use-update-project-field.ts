import { useMutation, useQueryClient } from "@tanstack/react-query";

import updateProjectField from "@/fetchers/project-field/update-project-field";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useUpdateProjectField(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProjectField,
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

export default useUpdateProjectField;
