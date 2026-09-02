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
