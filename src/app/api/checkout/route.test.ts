import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, makeSubscription } from "@/test/mocks/supabase";

const {
  createClientMock,
  getStripeMock,
  isStripeConfiguredMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getStripeMock: vi.fn(),
  isStripeConfiguredMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
  isStripeConfigured: isStripeConfiguredMock,
}));

import { POST } from "@/app/api/checkout/route";

describe("POST /api/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_PRICE_PLUS", "price_plus");
    vi.stubEnv("STRIPE_PRICE_PRO", "price_pro");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:43123");
  });

  it("returns 503 when Stripe is not configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "plus" }),
      }),
    );

    expect(response.status).toBe(503);
  });

  it("returns 401 when unauthenticated", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "plus" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects enterprise checkout", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(createSupabaseMock());

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "enterprise" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid tier for checkout.",
    });
  });

  it("rejects free tier checkout", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(createSupabaseMock());

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "free" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid tier for checkout.",
    });
  });

  it("creates a checkout session for plus", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({ stripe_customer_id: "cus_existing" }),
          error: null,
        },
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const createSession = vi.fn().mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    });
    getStripeMock.mockReturnValue({
      customers: { create: vi.fn() },
      checkout: { sessions: { create: createSession } },
    });

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "plus" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.com/test",
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        mode: "subscription",
        line_items: [{ price: "price_plus", quantity: 1 }],
      }),
    );
    expect(createSession.mock.calls[0]?.[0]).not.toHaveProperty("discounts");
  });

  it("ignores blank promo codes", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ stripe_customer_id: "cus_existing" }),
            error: null,
          },
        },
      }),
    );

    const listPromotionCodes = vi.fn();
    const createSession = vi.fn().mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    });
    getStripeMock.mockReturnValue({
      customers: { create: vi.fn() },
      promotionCodes: { list: listPromotionCodes },
      checkout: { sessions: { create: createSession } },
    });

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "plus", promoCode: "   " }),
      }),
    );

    expect(response.status).toBe(200);
    expect(listPromotionCodes).not.toHaveBeenCalled();
    expect(createSession.mock.calls[0]?.[0]).not.toHaveProperty("discounts");
  });

  it("applies a valid promo code as a checkout discount", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ stripe_customer_id: "cus_existing" }),
            error: null,
          },
        },
      }),
    );

    const listPromotionCodes = vi.fn().mockResolvedValue({
      data: [{ id: "promo_welcome20" }],
    });
    const createSession = vi.fn().mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    });
    getStripeMock.mockReturnValue({
      customers: { create: vi.fn() },
      promotionCodes: { list: listPromotionCodes },
      checkout: { sessions: { create: createSession } },
    });

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "plus", promoCode: " welcome20 " }),
      }),
    );

    expect(response.status).toBe(200);
    expect(listPromotionCodes).toHaveBeenCalledWith({
      code: "welcome20",
      active: true,
      limit: 1,
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ promotion_code: "promo_welcome20" }],
      }),
    );
    expect(createSession.mock.calls[0]?.[0]).not.toHaveProperty(
      "allow_promotion_codes",
    );
  });

  it("returns 400 when the promo code is unknown", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ stripe_customer_id: "cus_existing" }),
            error: null,
          },
        },
      }),
    );

    const createSession = vi.fn();
    getStripeMock.mockReturnValue({
      customers: { create: vi.fn() },
      promotionCodes: { list: vi.fn().mockResolvedValue({ data: [] }) },
      checkout: { sessions: { create: createSession } },
    });

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "plus", promoCode: "NOPE" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid or expired promo code.",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns 400 when Stripe rejects the promo on the selected plan", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ stripe_customer_id: "cus_existing" }),
            error: null,
          },
        },
      }),
    );

    const stripeError = Object.assign(new Error("Coupon does not apply."), {
      type: "StripeInvalidRequestError",
    });
    getStripeMock.mockReturnValue({
      customers: { create: vi.fn() },
      promotionCodes: {
        list: vi.fn().mockResolvedValue({ data: [{ id: "promo_restricted" }] }),
      },
      checkout: {
        sessions: { create: vi.fn().mockRejectedValue(stripeError) },
      },
    });

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "pro", promoCode: "PLUSONLY" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "This promo code cannot be applied to this plan.",
    });
  });

  it("creates a Stripe customer when none exists", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({ stripe_customer_id: null }),
          error: null,
        },
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const createCustomer = vi.fn().mockResolvedValue({ id: "cus_new" });
    const createSession = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/x" });
    getStripeMock.mockReturnValue({
      customers: { create: createCustomer },
      checkout: { sessions: { create: createSession } },
    });

    const response = await POST(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        body: JSON.stringify({ tier: "pro" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createCustomer).toHaveBeenCalledWith({
      email: "test@example.com",
      metadata: { user_id: "user-1" },
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new" }),
    );
  });
});
