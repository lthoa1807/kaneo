import { useQuery } from "@tanstack/react-query";
import listIntakeActivity from "@/fetchers/intake/list-intake-activity";

function useGetIntakeActivity(requestId: string | undefined) {
  return useQuery({
    queryKey: ["intake-activity", requestId],
    queryFn: () => listIntakeActivity(requestId as string),
    enabled: Boolean(requestId),
    refetchInterval: 30_000,
  });
}

export default useGetIntakeActivity;
