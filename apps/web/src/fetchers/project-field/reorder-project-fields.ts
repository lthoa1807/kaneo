import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

export type ReorderProjectFieldsRequest = {
  workspaceId: string;
  fields: Array<{ id: string; position: number }>;
};

async function reorderProjectFields({
  workspaceId,
  fields,
}: ReorderProjectFieldsRequest) {
  const response = await client["project-field"].reorder[":workspaceId"].$put({
    param: { workspaceId },
    json: { fields },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default reorderProjectFields;
