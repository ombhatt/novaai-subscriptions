import type Stripe from "stripe";
import {
  downgradeToFree,
  upsertSubscriptionFromStripe,
} from "@/lib/stripe-webhook-handler";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DunningSweepResult {
  canceled: number;
  failed: number;
  errors: string[];
}

function isAlreadyCanceledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such subscription|already canceled|resource_missing/i.test(message);
}

export async function cancelExpiredDunningSubscriptions(
  now = new Date(),
): Promise<DunningSweepResult> {
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select("user_id, stripe_customer_id, stripe_subscription_id")
    .eq("status", "past_due")
    .lte("grace_period_ends_at", now.toISOString())
    .not("stripe_subscription_id", "is", null);

  if (error) {
    throw new Error(`Failed to load expired dunning subscriptions: ${error.message}`);
  }

  const stripe = getStripe();
  const result: DunningSweepResult = { canceled: 0, failed: 0, errors: [] };

  for (const row of rows ?? []) {
    const subscriptionId = row.stripe_subscription_id as string;
    try {
      let subscription: Stripe.Subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (error) {
        if (isAlreadyCanceledError(error)) {
          await downgradeToFree(
            row.user_id as string,
            (row.stripe_customer_id as string | null) ?? undefined,
          );
          result.canceled += 1;
          continue;
        }
        throw error;
      }

      if (subscription.status !== "past_due" && subscription.status !== "unpaid") {
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id;

        if (subscription.status === "canceled") {
          await downgradeToFree(row.user_id as string, customerId);
          result.canceled += 1;
        } else {
          await upsertSubscriptionFromStripe(
            row.user_id as string,
            customerId,
            subscription,
          );
        }
        continue;
      }

      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (error) {
        if (!isAlreadyCanceledError(error)) {
          throw error;
        }
      }

      await downgradeToFree(
        row.user_id as string,
        (row.stripe_customer_id as string | null) ?? undefined,
      );
      result.canceled += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown dunning error";
      result.failed += 1;
      result.errors.push(`${subscriptionId}: ${message}`);
    }
  }

  return result;
}
