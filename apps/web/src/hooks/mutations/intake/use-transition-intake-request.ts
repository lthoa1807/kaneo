import { useMutation, useQueryClient } from "@tanstack/react-query";
import transitionIntakeRequest, {
  type TransitionIntakeRequestRequest,
} from "@/fetchers/intake/transition-intake-request";

export function useTransitionIntakeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: TransitionIntakeRequestRequest) =>
      transitionIntakeRequest(request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["intake-requests"] });
      queryClient.invalidateQueries({
        queryKey: ["intake-request", variables.requestId],
      });
      queryClient.invalidateQueries({
        queryKey: ["intake-activity", variables.requestId],
      });
    },
  });
}
