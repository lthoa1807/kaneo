import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

type ListIntakeRequestsResponse = InferResponseType<
  (typeof client)["intake"]["workspaces"][":workspaceId"]["intake-requests"]["$get"],
  200
>;

export type IntakeRequestListItem = ListIntakeRequestsResponse["items"][number];
export type IntakeRequestPage = ListIntakeRequestsResponse;

export type ListIntakeRequestsRequest = {
  workspaceId: string;
  projectId?: string;
  status?: string;
  page?: number;
  limit?: number;
};

async function listIntakeRequests({
  workspaceId,
  projectId,
  status,
  page,
  limit,
}: ListIntakeRequestsRequest) {
  const response = await client.intake.workspaces[":workspaceId"][
    "intake-requests"
  ].$get({
    param: { workspaceId },
    query: {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(page ? { page: String(page) } : {}),
      ...(limit ? { limit: String(limit) } : {}),
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default listIntakeRequests;
