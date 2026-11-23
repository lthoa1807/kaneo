import { useMutation, useQueryClient } from "@tanstack/react-query";

import createProjectField from "@/fetchers/project-field/create-project-field";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useCreateProjectField(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProjectField,
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

export default useCreateProjectField;
