import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

type ListIntakeProjectsResponse = InferResponseType<
  (typeof client)["intake"]["workspaces"][":workspaceId"]["intake-projects"]["$get"],
  200
>;

export type IntakeProject = ListIntakeProjectsResponse[number];

async function listIntakeProjects(workspaceId: string) {
  const response = await client.intake.workspaces[":workspaceId"][
    "intake-projects"
  ].$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default listIntakeProjects;
