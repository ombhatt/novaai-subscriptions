import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, makeSubscription } from "@/test/mocks/supabase";
import type { Subscription } from "@/lib/entitlements";

const { getStripeMock, upsertMock, createAdminClientMock } = vi.hoisted(() => ({
  getStripeMock: vi.fn(),
  upsertMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
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
    vi.stubEnv("STRIPE_PRICE_PLUS_ANNUAL", "price_plus_annual");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
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

  it("charges Plus monthly to annual immediately", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_plus" } }] },
    });
    const update = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_plus_annual" } }] },
    });
    getStripeMock.mockReturnValue({ subscriptions: { retrieve, update } });

    const result = await changePaidSubscriptionTier(
      makeSubscription({
        tier: "plus",
        billing_interval: "month",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_stripe",
      }) as Subscription,
      "plus",
      0,
      "year",
    );

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith("sub_stripe", {
      items: [{ id: "si_plus", price: "price_plus_annual" }],
      payment_behavior: "error_if_incomplete",
      proration_behavior: "always_invoice",
    });
  });

  it("releases a scheduled change before an immediate upgrade", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      schedule: "sched_old",
      items: { data: [{ id: "si_plus", price: { id: "price_plus" } }] },
    });
    const update = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      items: { data: [{ id: "si_plus", price: { id: "price_pro" } }] },
    });
    const release = vi.fn().mockResolvedValue({ id: "sched_old" });
    getStripeMock.mockReturnValue({
      subscriptions: { retrieve, update },
      subscriptionSchedules: { release },
    });
    const admin = createSupabaseMock();
    createAdminClientMock.mockReturnValue(admin);

    const result = await changePaidSubscriptionTier(
      makeSubscription({
        tier: "plus",
        billing_interval: "month",
        pending_tier: "plus",
        pending_billing_interval: "year",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_stripe",
      }) as Subscription,
      "pro",
      0,
      "month",
    );

    expect(result).toEqual({ ok: true });
    expect(release).toHaveBeenCalledWith("sched_old");
    expect(admin.builders.subscriptions.builder.lastUpdate).toEqual(
      expect.objectContaining({
        pending_tier: null,
        pending_billing_interval: null,
      }),
    );
  });

  it("schedules a move off annual billing until the current period ends", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_stripe",
      schedule: null,
      items: {
        data: [
          {
            id: "si_plus",
            price: { id: "price_plus_annual" },
            current_period_end: 1_800_000_000,
          },
        ],
      },
    });
    const update = vi.fn();
    const createSchedule = vi.fn().mockResolvedValue({
      id: "sched_1",
      phases: [{ start_date: 1_700_000_000 }],
    });
    const updateSchedule = vi.fn().mockResolvedValue({ id: "sched_1" });
    getStripeMock.mockReturnValue({
      subscriptions: { retrieve, update },
      subscriptionSchedules: { create: createSchedule, update: updateSchedule },
    });
    const admin = createSupabaseMock();
    createAdminClientMock.mockReturnValue(admin);

    const result = await changePaidSubscriptionTier(
      makeSubscription({
        tier: "plus",
        billing_interval: "year",
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_stripe",
      }) as Subscription,
      "plus",
      0,
      "month",
    );

    expect(result).toEqual({ ok: true });
    expect(update).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(createSchedule).toHaveBeenCalledWith({ from_subscription: "sub_stripe" });
    expect(updateSchedule).toHaveBeenCalledWith("sched_1", {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: "price_plus_annual", quantity: 1 }],
          start_date: 1_700_000_000,
          end_date: 1_800_000_000,
        },
        { items: [{ price: "price_plus", quantity: 1 }] },
      ],
    });
    expect(admin.builders.subscriptions.builder.lastUpdate).toEqual(
      expect.objectContaining({
        pending_tier: "plus",
        pending_billing_interval: "month",
      }),
    );
  });

  it("asks the customer to resume before leaving annual billing during a cancellation", async () => {
    const result = await changePaidSubscriptionTier(
      makeSubscription({
        tier: "plus",
        billing_interval: "year",
        cancel_at_period_end: true,
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_stripe",
      }) as Subscription,
      "plus",
      0,
      "month",
    );

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "Resume your plan before switching off annual billing.",
    });
    expect(getStripeMock).not.toHaveBeenCalled();
  });
});

const planChanges = [
  {
    from: "Plus monthly",
    to: "Plus annual",
    tier: "plus",
    interval: "month",
    nextTier: "plus",
    nextInterval: "year",
    currentPrice: "price_plus",
    nextPrice: "price_plus_annual",
    when: "now",
    proration: "always_invoice",
  },
  {
    from: "Plus monthly",
    to: "Pro monthly",
    tier: "plus",
    interval: "month",
    nextTier: "pro",
    nextInterval: "month",
    currentPrice: "price_plus",
    nextPrice: "price_pro",
    when: "now",
    proration: "always_invoice",
  },
  {
    from: "Plus monthly",
    to: "Pro annual",
    tier: "plus",
    interval: "month",
    nextTier: "pro",
    nextInterval: "year",
    currentPrice: "price_plus",
    nextPrice: "price_pro_annual",
    when: "now",
    proration: "always_invoice",
  },
  {
    from: "Plus annual",
    to: "Pro annual",
    tier: "plus",
    interval: "year",
    nextTier: "pro",
    nextInterval: "year",
    currentPrice: "price_plus_annual",
    nextPrice: "price_pro_annual",
    when: "now",
    proration: "always_invoice",
  },
  {
    from: "Pro monthly",
    to: "Pro annual",
    tier: "pro",
    interval: "month",
    nextTier: "pro",
    nextInterval: "year",
    currentPrice: "price_pro",
    nextPrice: "price_pro_annual",
    when: "now",
    proration: "always_invoice",
  },
  {
    from: "Pro monthly",
    to: "Plus annual",
    tier: "pro",
    interval: "month",
    nextTier: "plus",
    nextInterval: "year",
    currentPrice: "price_pro",
    nextPrice: "price_plus_annual",
    when: "now",
    proration: "always_invoice",
  },
  {
    from: "Pro monthly",
    to: "Plus monthly",
    tier: "pro",
    interval: "month",
    nextTier: "plus",
    nextInterval: "month",
    currentPrice: "price_pro",
    nextPrice: "price_plus",
    when: "now",
    proration: "create_prorations",
  },
  {
    from: "Plus annual",
    to: "Plus monthly",
    tier: "plus",
    interval: "year",
    nextTier: "plus",
    nextInterval: "month",
    currentPrice: "price_plus_annual",
    nextPrice: "price_plus",
    when: "renewal",
  },
  {
    from: "Plus annual",
    to: "Pro monthly",
    tier: "plus",
    interval: "year",
    nextTier: "pro",
    nextInterval: "month",
    currentPrice: "price_plus_annual",
    nextPrice: "price_pro",
    when: "renewal",
  },
  {
    from: "Pro annual",
    to: "Pro monthly",
    tier: "pro",
    interval: "year",
    nextTier: "pro",
    nextInterval: "month",
    currentPrice: "price_pro_annual",
    nextPrice: "price_pro",
    when: "renewal",
  },
  {
    from: "Pro annual",
    to: "Plus monthly",
    tier: "pro",
    interval: "year",
    nextTier: "plus",
    nextInterval: "month",
    currentPrice: "price_pro_annual",
    nextPrice: "price_plus",
    when: "renewal",
  },
  {
    from: "Pro annual",
    to: "Plus annual",
    tier: "pro",
    interval: "year",
    nextTier: "plus",
    nextInterval: "year",
    currentPrice: "price_pro_annual",
    nextPrice: "price_plus_annual",
    when: "renewal",
  },
] as const;

describe("every paid tier and billing cycle change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    vi.stubEnv("STRIPE_PRICE_PLUS_ANNUAL", "price_plus_annual");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", "price_pro_annual");
    upsertMock.mockResolvedValue(undefined);
  });

  it.each(planChanges)(
    "moves $from to $to at $when",
    async ({
      tier,
      interval,
      nextTier,
      nextInterval,
      currentPrice,
      nextPrice,
      when,
      ...change
    }) => {
      const retrieve = vi.fn().mockResolvedValue({
        id: "sub_stripe",
        schedule: null,
        items: {
          data: [
            {
              id: "si_1",
              price: { id: currentPrice },
              current_period_end: 1_800_000_000,
            },
          ],
        },
      });
      const update = vi.fn().mockResolvedValue({
        id: "sub_stripe",
        items: { data: [{ id: "si_1", price: { id: nextPrice } }] },
      });
      const createSchedule = vi.fn().mockResolvedValue({
        id: "sched_1",
        phases: [{ start_date: 1_700_000_000 }],
      });
      const updateSchedule = vi.fn().mockResolvedValue({ id: "sched_1" });
      getStripeMock.mockReturnValue({
        subscriptions: { retrieve, update },
        subscriptionSchedules: { create: createSchedule, update: updateSchedule },
      });
      const admin = createSupabaseMock();
      createAdminClientMock.mockReturnValue(admin);

      const result = await changePaidSubscriptionTier(
        makeSubscription({
          tier,
          billing_interval: interval,
          stripe_customer_id: "cus_1",
          stripe_subscription_id: "sub_stripe",
        }) as Subscription,
        nextTier,
        0,
        nextInterval,
      );

      expect(result).toEqual({ ok: true });

      if (when === "renewal") {
        expect(update).not.toHaveBeenCalled();
        expect(upsertMock).not.toHaveBeenCalled();
        expect(updateSchedule).toHaveBeenCalledWith("sched_1", {
          end_behavior: "release",
          phases: [
            {
              items: [{ price: currentPrice, quantity: 1 }],
              start_date: 1_700_000_000,
              end_date: 1_800_000_000,
            },
            { items: [{ price: nextPrice, quantity: 1 }] },
          ],
        });
        expect(admin.builders.subscriptions.builder.lastUpdate).toEqual(
          expect.objectContaining({
            pending_tier: nextTier,
            pending_billing_interval: nextInterval,
          }),
        );
        return;
      }

      if (!("proration" in change)) {
        throw new Error(`Missing proration for an immediate change to ${nextPrice}`);
      }
      expect(createSchedule).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith("sub_stripe", {
        items: [{ id: "si_1", price: nextPrice }],
        proration_behavior: change.proration,
        ...(change.proration === "always_invoice"
          ? { payment_behavior: "error_if_incomplete" }
          : {}),
      });
      expect(upsertMock).toHaveBeenCalled();
    },
  );
});
