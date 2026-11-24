import { useMutation, useQueryClient } from "@tanstack/react-query";
import createIntakeRequest, {
  type CreateIntakeRequestRequest,
} from "@/fetchers/intake/create-intake-request";

export function useCreateIntakeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateIntakeRequestRequest) =>
      createIntakeRequest(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intake-requests"] });
    },
  });
}
