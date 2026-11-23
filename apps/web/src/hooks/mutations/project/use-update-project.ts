import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProject from "@/fetchers/project/update-project";
import { invalidateProjectFieldTables } from "./project-field-invalidation";

function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProject,
    onSuccess: () => {
      void invalidateProjectFieldTables(queryClient, undefined);
    },
  });
}

export default useUpdateProject;
