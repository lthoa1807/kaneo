import { useMutation, useQueryClient } from "@tanstack/react-query";
import moveProject from "@/fetchers/project/move-project";
import {
  invalidateProjectFieldTables,
  invalidateProjectFieldValues,
} from "./project-field-invalidation";

function useMoveProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: moveProject,
    onMutate: ({ id }) => {
      const project = queryClient.getQueryData<{ workspaceId?: string }>([
        "project",
        id,
      ]);
      return { sourceWorkspaceId: project?.workspaceId };
    },
    // `["projects"]` prefix-matches both the source and target listings.
    // `["tasks", id]` backs the project store, which still carries the old
    // workspace id that other views build links from.
    onSuccess: async (_data, { id, workspaceId }, context) => {
      void invalidateProjectFieldTables(
        queryClient,
        context?.sourceWorkspaceId,
      );
      void invalidateProjectFieldTables(queryClient, workspaceId);
      void invalidateProjectFieldValues(queryClient, id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["external-links"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks", id] }),
      ]);
    },
  });
}

export default useMoveProject;
