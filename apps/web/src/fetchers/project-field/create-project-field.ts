import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

import { HttpError } from "@/lib/http-error";

export type CreateProjectFieldRequest = InferRequestType<
  (typeof client)["project-field"]["$post"]
>["json"];

async function createProjectField(json: CreateProjectFieldRequest) {
  const response = await client["project-field"].$post({ json });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default createProjectField;
