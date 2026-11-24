import { useQuery } from "@tanstack/react-query";
import listIntakeProjects from "@/fetchers/intake/list-intake-projects";

function useGetIntakeProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["intake-projects", workspaceId],
    queryFn: () => listIntakeProjects(workspaceId as string),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
  });
}

export default useGetIntakeProjects;
