import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateIntakeRequest, {
  type UpdateIntakeRequestRequest,
} from "@/fetchers/intake/update-intake-request";

export function useUpdateIntakeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateIntakeRequestRequest) =>
      updateIntakeRequest(request),
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
