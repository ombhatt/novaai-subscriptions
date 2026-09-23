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
      0,
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
      0,
    );
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Already on this plan.",
    });
  });

  it("rejects plan changes while the subscription is past due", async () => {
    const result = await changePaidSubscriptionTier(
      makeSubscription({
        tier: "pro",
        status: "past_due",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_stripe",
      }) as Subscription,
      "plus",
      10_000,
    );

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Resolve your outstanding billing issue before changing plans.",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("charges an upgrade immediately without reversing a scheduled cancellation", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      cancel_at_period_end: true,
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

    const result = await changePaidSubscriptionTier(subscription, "pro", 0);

    expect(result).toEqual({ ok: true });
    expect(retrieve).toHaveBeenCalledWith("sub_stripe");
    expect(update).toHaveBeenCalledWith("sub_stripe", {
      items: [{ id: "si_plus", price: "price_pro" }],
      payment_behavior: "error_if_incomplete",
      proration_behavior: "always_invoice",
    });
    expect(upsertMock).toHaveBeenCalledWith("user-1", "cus_1", {
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_pro" } }] },
    });
  });

  it("rejects a downgrade when current-period usage already exceeds the target plan", async () => {
    const subscription = makeSubscription({
      tier: "pro",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_stripe",
    }) as Subscription;

    const result = await changePaidSubscriptionTier(subscription, "plus", 80_000);

    expect(result).toEqual({
      ok: false,
      status: 409,
      error:
        "You have already used the plus plan's request allowance for this billing period. Try again after your next billing period begins.",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("leaves downgrade credits on the next invoice", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_pro", price: { id: "price_pro" } }] },
    });
    const update = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_pro", price: { id: "price_plus" } }] },
    });
    getStripeMock.mockReturnValue({ subscriptions: { retrieve, update } });

    const subscription = makeSubscription({
      tier: "pro",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_stripe",
    }) as Subscription;

    await expect(changePaidSubscriptionTier(subscription, "plus", 1_000)).resolves.toEqual({
      ok: true,
    });
    expect(update).toHaveBeenCalledWith("sub_stripe", {
      items: [{ id: "si_pro", price: "price_plus" }],
      proration_behavior: "create_prorations",
    });
  });

  it("does not grant Pro when Stripe cannot collect the upgrade invoice", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_plus" } }] },
    });
    const update = vi.fn().mockRejectedValue(new Error("card declined"));
    getStripeMock.mockReturnValue({ subscriptions: { retrieve, update } });

    const subscription = makeSubscription({
      tier: "plus",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_stripe",
    }) as Subscription;

    await expect(changePaidSubscriptionTier(subscription, "pro", 0)).rejects.toThrow(
      "card declined",
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
