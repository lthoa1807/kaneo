import { useQuery } from "@tanstack/react-query";
import getDashboardSummary from "@/fetchers/dashboard/get-dashboard-summary";

function useGetDashboardSummary(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: ["dashboard", workspaceId],
    queryFn: () => getDashboardSummary(workspaceId),
    enabled: enabled && Boolean(workspaceId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });
}

export default useGetDashboardSummary;
