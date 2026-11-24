import { useQuery } from "@tanstack/react-query";
import listIntakeRequests, {
  type ListIntakeRequestsRequest,
} from "@/fetchers/intake/list-intake-requests";

function useGetIntakeRequests({
  workspaceId,
  projectId,
  status,
  page,
  limit,
}: ListIntakeRequestsRequest) {
  return useQuery({
    queryKey: [
      "intake-requests",
      workspaceId,
      { projectId, status, page, limit },
    ],
    queryFn: () =>
      listIntakeRequests({ workspaceId, projectId, status, page, limit }),
    enabled: Boolean(workspaceId),
    refetchInterval: 30_000,
  });
}

export default useGetIntakeRequests;
