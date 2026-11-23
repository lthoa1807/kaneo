import { useMutation, useQueryClient } from "@tanstack/react-query";
import createProject from "@/fetchers/project/create-project";
import { projectFieldKeys } from "@/lib/project-field-query-keys";

function useCreateProject({
  name,
  slug,
  workspaceId,
  icon,
}: {
  name: string;
  slug: string;
  workspaceId: string;
  icon: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => createProject({ name, slug, workspaceId, icon }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectFieldKeys.tableAll(workspaceId),
      });
    },
  });
}

export default useCreateProject;
