import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type CreateIntakeRequestRequest = {
  workspaceId: string;
  projectId: string;
  title: string;
  description?: string;
};

async function createIntakeRequest({
  workspaceId,
  projectId,
  title,
  description,
}: CreateIntakeRequestRequest) {
  const response = await client.intake.workspaces[":workspaceId"][
    "intake-requests"
  ].$post({
    param: { workspaceId },
    json: { projectId, title, description },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default createIntakeRequest;
