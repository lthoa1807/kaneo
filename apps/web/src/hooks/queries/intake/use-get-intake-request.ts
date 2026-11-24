import { useQuery } from "@tanstack/react-query";
import getIntakeRequest from "@/fetchers/intake/get-intake-request";

function useGetIntakeRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ["intake-request", requestId],
    queryFn: () => getIntakeRequest(requestId as string),
    enabled: Boolean(requestId),
    refetchInterval: 30_000,
  });
}

export default useGetIntakeRequest;
