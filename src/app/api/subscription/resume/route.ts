import { handleCancelAtPeriodEndRequest } from "@/lib/subscription-cancel";

export async function POST() {
  return handleCancelAtPeriodEndRequest(false);
}
