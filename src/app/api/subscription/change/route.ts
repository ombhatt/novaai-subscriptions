import { handleChangePaidPlanRequest } from "@/lib/subscription-change";

export async function POST(request: Request) {
  return handleChangePaidPlanRequest(request);
}
