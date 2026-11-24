import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

type GetIntakeRequestResponse = InferResponseType<
  (typeof client)["intake"]["requests"][":requestId"]["$get"],
  200
>;

export type IntakeRequest = GetIntakeRequestResponse;

async function getIntakeRequest(requestId: string) {
  const response = await client.intake.requests[":requestId"].$get({
    param: { requestId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default getIntakeRequest;
