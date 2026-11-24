import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type AttachIntakeTaskBody = InferRequestType<
  (typeof client)["intake"]["requests"][":requestId"]["tasks"]["$post"]
>["json"];

async function attachIntakeTask(requestId: string, body: AttachIntakeTaskBody) {
  const response = await client.intake.requests[":requestId"].tasks.$post({
    param: { requestId },
    json: body,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default attachIntakeTask;
