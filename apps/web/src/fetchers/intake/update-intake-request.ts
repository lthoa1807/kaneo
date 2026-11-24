import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type UpdateIntakeRequestRequest = {
  requestId: string;
  title?: string;
  description?: string | null;
};

async function updateIntakeRequest({
  requestId,
  title,
  description,
}: UpdateIntakeRequestRequest) {
  const response = await client.intake.requests[":requestId"].$patch({
    param: { requestId },
    json: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
    },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default updateIntakeRequest;
