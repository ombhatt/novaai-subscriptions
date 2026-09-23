import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSubscription } from "@/test/mocks/supabase";
import type { Subscription } from "@/lib/entitlements";

const { getStripeMock, upsertMock } = vi.hoisted(() => ({
  getStripeMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

vi.mock("@/lib/stripe-webhook-handler", () => ({
  upsertSubscriptionFromStripe: upsertMock,
}));

import { changePaidSubscriptionTier } from "@/lib/subscription-change";

describe("changePaidSubscriptionTier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    upsertMock.mockResolvedValue(undefined);
  });

  it("rejects free plans without a Stripe subscription", async () => {
    const result = await changePaidSubscriptionTier(
      makeSubscription() as Subscription,
      "pro",
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "No paid subscription to change.",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
  });

  it("rejects switching to the current plan", async () => {
    const result = await changePaidSubscriptionTier(
      makeSubscription({
        tier: "plus",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_stripe",
      }) as Subscription,
      "plus",
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Already on this plan.",
    });
  });

  it("updates the existing Plus subscription to the Pro price", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_plus" } }] },
    });
    const update = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_pro" } }] },
    });
    getStripeMock.mockReturnValue({ subscriptions: { retrieve, update } });

    const subscription = makeSubscription({
      tier: "plus",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_stripe",
    }) as Subscription;

    const result = await changePaidSubscriptionTier(subscription, "pro");

    expect(result).toEqual({ ok: true });
    expect(retrieve).toHaveBeenCalledWith("sub_stripe");
    expect(update).toHaveBeenCalledWith("sub_stripe", {
      items: [{ id: "si_plus", price: "price_pro" }],
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
    });
    expect(upsertMock).toHaveBeenCalledWith("user-1", "cus_1", {
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_pro" } }] },
    });
  });
});
