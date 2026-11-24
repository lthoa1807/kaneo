import { useMutation, useQueryClient } from "@tanstack/react-query";
import attachIntakeTask, {
  type AttachIntakeTaskBody,
} from "@/fetchers/intake/attach-intake-task";

export type AttachIntakeTaskRequest = {
  requestId: string;
  // Needed to refresh the board the new task lands on; the API takes the body only.
  projectId: string;
  body: AttachIntakeTaskBody;
};

export function useAttachIntakeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, body }: AttachIntakeTaskRequest) =>
      attachIntakeTask(requestId, body),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["intake-requests"] });
      queryClient.invalidateQueries({
        queryKey: ["intake-request", variables.requestId],
      });
      queryClient.invalidateQueries({
        queryKey: ["intake-activity", variables.requestId],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["assigned-tasks"] });
    },
  });
}
