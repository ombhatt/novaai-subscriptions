import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
} from "@/lib/stripe-subscription";

function makeStripeSubscription(
  items: Array<{ current_period_start?: number; current_period_end?: number }> = [],
): Stripe.Subscription {
  return {
    items: {
      data: items.map((item, index) => ({
        id: `si_${index}`,
        current_period_start: item.current_period_start,
        current_period_end: item.current_period_end,
      })),
    },
  } as unknown as Stripe.Subscription;
}

describe("getSubscriptionPeriod", () => {
  it("returns period from the first subscription item", () => {
    const subscription = makeStripeSubscription([
      { current_period_start: 1_700_000_000, current_period_end: 1_702_592_000 },
    ]);

    expect(getSubscriptionPeriod(subscription)).toEqual({
      currentPeriodStart: 1_700_000_000,
      currentPeriodEnd: 1_702_592_000,
    });
  });

  it("returns nulls when there are no items", () => {
    expect(getSubscriptionPeriod(makeStripeSubscription([]))).toEqual({
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
  });
});

describe("getInvoiceSubscriptionId", () => {
  it("reads parent.subscription_details.subscription", () => {
    const invoice = {
      parent: { subscription_details: { subscription: "sub_abc" } },
    } as Stripe.Invoice;
    expect(getInvoiceSubscriptionId(invoice)).toBe("sub_abc");
  });

  it("reads a legacy subscription field", () => {
    const invoice = { subscription: "sub_legacy" } as unknown as Stripe.Invoice;
    expect(getInvoiceSubscriptionId(invoice)).toBe("sub_legacy");
  });

  it("returns null when neither field is present", () => {
    expect(getInvoiceSubscriptionId({} as Stripe.Invoice)).toBeNull();
  });
});
