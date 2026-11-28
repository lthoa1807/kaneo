import { useQueries } from "@tanstack/react-query";
import listIntakeRequests, {
  type ListIntakeRequestsRequest,
} from "@/fetchers/intake/list-intake-requests";

type IntakeRequestPagesArgs = Omit<ListIntakeRequestsRequest, "page"> & {
  totalPages: number;
  enabled: boolean;
};

/**
 * Pages after the first, so "Show all" appends instead of replacing. The key
 * shape matches useGetIntakeRequests, so the 30s poll covers every loaded page.
 */
function useGetIntakeRequestPages({
  workspaceId,
  projectId,
  status,
  group,
  limit,
  totalPages,
  enabled,
}: IntakeRequestPagesArgs) {
  const pages = Array.from(
    { length: Math.max(totalPages - 1, 0) },
    (_, index) => index + 2,
  );

  return useQueries({
    queries: pages.map((page) => ({
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
      enabled: enabled && Boolean(workspaceId),
      refetchInterval: 30_000,
    })),
    combine: (results) => ({
      // Independent polls can briefly show the same request on two pages, so
      // ids are unique before the rows are appended.
      items: [
        ...new Map(
          results
            .flatMap((result) => result.data?.items ?? [])
            .map((item) => [item.id, item]),
        ).values(),
      ],
      isFetching: results.some((result) => result.isFetching),
      isError: results.some((result) => result.isError),
      refetch: () => Promise.all(results.map((result) => result.refetch())),
    }),
  });
}

export default useGetIntakeRequestPages;
