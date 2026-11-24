import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

type ListIntakeActivityResponse = InferResponseType<
  (typeof client)["intake"]["requests"][":requestId"]["activity"]["$get"],
  200
>;

export type IntakeActivity = ListIntakeActivityResponse["items"][number];

async function listIntakeActivity(requestId: string) {
  const response = await client.intake.requests[":requestId"].activity.$get({
    param: { requestId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default listIntakeActivity;
