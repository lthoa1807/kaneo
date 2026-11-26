import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

async function getDashboardSummary(workspaceId: string) {
  const response = await client.workspace[":workspaceId"].dashboard.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getDashboardSummary;
