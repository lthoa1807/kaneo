import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type GetProjectMembersRequest = {
  workspaceId: string;
  projectId: string;
};

async function getProjectMembers({
  workspaceId,
  projectId,
}: GetProjectMembersRequest) {
  const response = await client.workspace[":workspaceId"].members.$get({
    param: { workspaceId },
    // Guests never take assignments; keep them out of the assignee picker.
    query: { projectId, assignable: "true" },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getProjectMembers;
