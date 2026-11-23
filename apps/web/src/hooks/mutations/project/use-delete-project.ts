import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteProject from "@/fetchers/project/delete-project";
import {
  invalidateProjectFieldTables,
  invalidateProjectFieldValues,
} from "./project-field-invalidation";

function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProject,
    onSuccess: (_data, { id }) => {
      void invalidateProjectFieldTables(queryClient, undefined);
      void invalidateProjectFieldValues(queryClient, id);
    },
  });
}

export default useDeleteProject;
