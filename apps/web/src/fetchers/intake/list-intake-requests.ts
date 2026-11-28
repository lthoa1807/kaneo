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
  status?: IntakeRequestListItem["status"];
  group?: "all" | "waiting" | "in_progress" | "awaiting";
  page?: number;
  limit?: number;
};

async function listIntakeRequests({
  workspaceId,
  projectId,
  status,
  group,
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
      ...(group && group !== "all" ? { group } : {}),
      page: page ? String(page) : undefined,
      limit: limit ? String(limit) : undefined,
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default listIntakeRequests;
