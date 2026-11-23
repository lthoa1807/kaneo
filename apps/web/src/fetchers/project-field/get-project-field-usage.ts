import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

async function getProjectFieldUsage(id: string) {
  const response = await client["project-field"][":id"].usage.$get({
    param: { id },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getProjectFieldUsage;
