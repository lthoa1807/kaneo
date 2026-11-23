import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

export type SetProjectFieldValueRequest = {
  projectId: string;
  fieldId: string;
  value: string | null;
};

async function setProjectFieldValue({
  projectId,
  fieldId,
  value,
}: SetProjectFieldValueRequest) {
  const response = await client["project-field"].project[
    ":projectId"
  ].value.$put({ param: { projectId }, json: { fieldId, value } });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default setProjectFieldValue;
