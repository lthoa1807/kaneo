import { useQuery } from "@tanstack/react-query";
import getDashboardTaskDrilldown from "@/fetchers/dashboard/get-dashboard-task-drilldown";
import type { DrillFilters } from "@/components/dashboard/types";

function useGetDashboardDrilldown(
  workspaceId: string,
  filters: DrillFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["dashboard", workspaceId, "tasks", filters],
    queryFn: () => getDashboardTaskDrilldown(workspaceId, filters),
    enabled: enabled && Boolean(workspaceId),
  });
}

export default useGetDashboardDrilldown;
