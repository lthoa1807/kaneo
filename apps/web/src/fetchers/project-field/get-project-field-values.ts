import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

async function getProjectFieldValues(projectId: string) {
  const response = await client["project-field"].project[":projectId"].$get({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getProjectFieldValues;
