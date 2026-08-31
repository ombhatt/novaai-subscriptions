import type Stripe from "stripe";

export function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];

  return {
    currentPeriodStart: item?.current_period_start ?? null,
    currentPeriodEnd: item?.current_period_end ?? null,
  };
}
