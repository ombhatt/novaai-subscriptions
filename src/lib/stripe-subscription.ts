import type Stripe from "stripe";

export function getSubscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];

  return {
    currentPeriodStart: item?.current_period_start ?? null,
    currentPeriodEnd: item?.current_period_end ?? null,
  };
}

function idFromExpandable(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

/** Stripe API 2025+ nests this on invoice.parent; older payloads still use invoice.subscription. */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent as
    | { subscription_details?: { subscription?: unknown } }
    | null
    | undefined;
  const fromParent = idFromExpandable(parent?.subscription_details?.subscription);
  if (fromParent) return fromParent;

  return idFromExpandable((invoice as { subscription?: unknown }).subscription);
}
