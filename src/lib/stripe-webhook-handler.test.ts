import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createQueryBuilder, createSupabaseMock } from "@/test/mocks/supabase";

const { createAdminClientMock, getStripeMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getStripeMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

import { handleStripeWebhookEvent } from "@/lib/stripe-webhook-handler";

function makeEvent(
  type: string,
  object: Record<string, unknown>,
  id = `evt_${type}`,
): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

function makeStripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    status: "active",
    cancel_at_period_end: false,
    customer: "cus_123",
    items: {
      data: [
        {
          id: "si_1",
          price: { id: "price_plus_test" },
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
        },
      ],
    },
    ...overrides,
  };
}

describe("handleStripeWebhookEvent", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus_test");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro_test");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips duplicate webhook events (idempotent)", async () => {
    const insert = createQueryBuilder({
      data: null,
      error: { message: "duplicate", code: "23505" },
    });
    const lookup = createQueryBuilder({
      data: { processed_at: "2026-09-12T10:00:00.000Z" },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(insert.builder)
      .mockReturnValueOnce(lookup.builder);
    const supabase = { from };
    createAdminClientMock.mockReturnValue(supabase);

    await expect(
      handleStripeWebhookEvent(
        makeEvent("invoice.paid", { customer: "cus_123" }, "evt_dup"),
      ),
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledTimes(2);
    expect(lookup.builder.select).toHaveBeenCalledWith("processed_at");
  });

  it("retries a duplicate event whose processing never completed", async () => {
    const insert = createQueryBuilder({
      data: null,
      error: { message: "duplicate", code: "23505" },
    });
    const lookup = createQueryBuilder({
      data: { processed_at: null },
      error: null,
    });
    const complete = createQueryBuilder({ data: null, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(insert.builder)
      .mockReturnValueOnce(lookup.builder)
      .mockReturnValueOnce(complete.builder);
    const supabase = { from };
    createAdminClientMock.mockReturnValue(supabase);

    await expect(
      handleStripeWebhookEvent(makeEvent("ping", {}, "evt_incomplete")),
    ).resolves.toBeUndefined();

    expect(complete.builder.update).toHaveBeenCalledWith({
      processed_at: expect.any(String),
    });
    expect(complete.builder.eq).toHaveBeenCalledWith("id", "evt_incomplete");
  });

  it("upserts subscription on checkout.session.completed", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const retrieve = vi.fn().mockResolvedValue(makeStripeSubscription());
    getStripeMock.mockReturnValue({
      subscriptions: { retrieve },
    });

    await handleStripeWebhookEvent(
      makeEvent("checkout.session.completed", {
        metadata: { user_id: "user-1" },
        customer: "cus_123",
        subscription: "sub_123",
      }),
    );

    expect(retrieve).toHaveBeenCalledWith("sub_123");
    expect(supabase.from).toHaveBeenCalledWith("subscriptions");
  });

  it("releases a failed event so Stripe can retry it", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await expect(
      handleStripeWebhookEvent(
        makeEvent("checkout.session.completed", {
          metadata: {},
          customer: null,
          subscription: null,
        }),
      ),
    ).rejects.toThrow(/missing user_id, customer, or subscription/);

    const release = supabase.builders.stripe_webhook_events.builder;
    expect(supabase.from).toHaveBeenNthCalledWith(2, "stripe_webhook_events");
    expect(release.delete).toHaveBeenCalledWith();
    expect(release.eq).toHaveBeenCalledWith("id", "evt_checkout.session.completed");
  });

  it("downgrades to free on customer.subscription.deleted", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: { data: { user_id: "user-1" }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await handleStripeWebhookEvent(
      makeEvent("customer.subscription.deleted", makeStripeSubscription()),
    );

    expect(supabase.from).toHaveBeenCalledWith("subscriptions");
    expect(supabase.builders.subscriptions.builder.lastUpdate).toEqual(
      expect.objectContaining({
        grace_period_ends_at: null,
        tier: "free",
        status: "active",
      }),
    );
  });

  it("preserves paid access when Stripe cancels during dunning grace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: {
          data: {
            user_id: "user-1",
            status: "past_due",
            grace_period_ends_at: "2026-09-11T12:00:00.000Z",
          },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await handleStripeWebhookEvent(
      makeEvent("customer.subscription.deleted", makeStripeSubscription()),
    );

    expect(supabase.builders.subscriptions.builder.lastUpdate).toBeUndefined();
  });

  it("marks subscription past_due on invoice.payment_failed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T12:00:00.000Z"));
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: { data: { user_id: "user-1" }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await handleStripeWebhookEvent(
      makeEvent("invoice.payment_failed", { customer: "cus_123" }),
    );

    expect(supabase.builders.subscriptions.builder.lastUpdate).toEqual(
      expect.objectContaining({
        status: "past_due",
        grace_period_ends_at: "2026-09-11T12:00:00.000Z",
      }),
    );
  });

  it("does not extend grace_period_ends_at on a later payment_failed", async () => {
    const existing = "2026-09-10T00:00:00.000Z";
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: {
          data: { user_id: "user-1", grace_period_ends_at: existing },
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await handleStripeWebhookEvent(
      makeEvent("invoice.payment_failed", { customer: "cus_123" }, "evt_retry"),
    );

    expect(supabase.builders.subscriptions.builder.lastUpdate).toEqual(
      expect.objectContaining({
        status: "past_due",
        grace_period_ends_at: existing,
      }),
    );
  });

  it("marks subscription active on invoice.paid when there is no subscription id", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: { data: { user_id: "user-1" }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await handleStripeWebhookEvent(
      makeEvent("invoice.paid", { customer: "cus_123" }),
    );

    expect(supabase.from).toHaveBeenCalledWith("subscriptions");
    expect(getStripeMock).not.toHaveBeenCalled();
    expect(supabase.builders.subscriptions.builder.lastUpdate).toEqual(
      expect.objectContaining({
        status: "active",
        grace_period_ends_at: null,
      }),
    );
  });

  it("refreshes billing period on invoice.paid when a subscription is present", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: { data: { user_id: "user-1" }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    const retrieve = vi.fn().mockResolvedValue(makeStripeSubscription());
    getStripeMock.mockReturnValue({
      subscriptions: { retrieve },
    });

    await handleStripeWebhookEvent(
      makeEvent("invoice.paid", {
        customer: "cus_123",
        parent: { subscription_details: { subscription: "sub_123" } },
      }),
    );

    expect(retrieve).toHaveBeenCalledWith("sub_123");
    expect(supabase.from).toHaveBeenCalledWith("subscriptions");
  });

  it("upserts on subscription.updated when still active", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: { data: { user_id: "user-1" }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await handleStripeWebhookEvent(
      makeEvent(
        "customer.subscription.updated",
        makeStripeSubscription({ status: "active" }),
      ),
    );

    expect(supabase.from).toHaveBeenCalledWith("subscriptions");
  });

  it("downgrades when subscription.updated status is canceled", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
        subscriptions: { data: { user_id: "user-1" }, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await handleStripeWebhookEvent(
      makeEvent(
        "customer.subscription.updated",
        makeStripeSubscription({ status: "canceled" }),
      ),
    );

    expect(supabase.from).toHaveBeenCalledWith("subscriptions");
  });

  it("ignores unknown event types after recording", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        stripe_webhook_events: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await expect(
      handleStripeWebhookEvent(makeEvent("ping", {})),
    ).resolves.toBeUndefined();
  });
});
