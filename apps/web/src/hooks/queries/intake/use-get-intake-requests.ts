import { useQuery } from "@tanstack/react-query";
import listIntakeRequests, {
  type ListIntakeRequestsRequest,
} from "@/fetchers/intake/list-intake-requests";

function useGetIntakeRequests({
  workspaceId,
  projectId,
  status,
  group,
  page,
  limit,
}: ListIntakeRequestsRequest) {
  return useQuery({
    queryKey: [
      "intake-requests",
      workspaceId,
      { projectId, status, group, page, limit },
    ],
    queryFn: () =>
      listIntakeRequests({
        workspaceId,
        projectId,
        status,
        group,
        page,
        limit,
      }),
    enabled: Boolean(workspaceId),
    // Keep counts and the legend mounted while a new group loads, so the
    // selected button and the numbers do not blink out (FR-03, focus rule).
    // Only the guest portal passes `group`; staff and the dashboard would
    // otherwise show the previous filter's rows as if they matched.
    placeholderData:
      group === undefined ? undefined : (previousData) => previousData,
    refetchInterval: 30_000,
  });
}

export default useGetIntakeRequests;
