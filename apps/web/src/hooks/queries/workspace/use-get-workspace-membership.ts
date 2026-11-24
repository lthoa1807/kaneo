import { useQuery } from "@tanstack/react-query";
import getWorkspaceMembership from "@/fetchers/workspace/get-workspace-membership";

// The caller's own membership, readable by guests too (they hold no
// workspace:read, so capabilities and this answer are the only way in).
function useGetWorkspaceMembership(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["workspace-membership", workspaceId],
    queryFn: () => getWorkspaceMembership(workspaceId as string),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
  });
}

export default useGetWorkspaceMembership;
