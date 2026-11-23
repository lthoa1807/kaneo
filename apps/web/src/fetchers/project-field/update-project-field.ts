import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

import { HttpError } from "@/lib/http-error";

export type UpdateProjectFieldRequest = InferRequestType<
  (typeof client)["project-field"][":id"]["$put"]
>["json"];

async function updateProjectField({
  id,
  ...json
}: UpdateProjectFieldRequest & { id: string }) {
  const response = await client["project-field"][":id"].$put({
    param: { id },
    json,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default updateProjectField;
