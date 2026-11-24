import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type TransitionIntakeRequestRequest = {
  requestId: string;
  to: string;
  note?: string;
};

async function transitionIntakeRequest({
  requestId,
  to,
  note,
}: TransitionIntakeRequestRequest) {
  const response = await client.intake.requests[":requestId"].transition.$post({
    param: { requestId },
    json: { to, ...(note ? { note } : {}) },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default transitionIntakeRequest;
