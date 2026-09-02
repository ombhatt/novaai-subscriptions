import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("stripe helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("stripe");
  });

  it("isStripeConfigured requires both secret and publishable keys", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    const { isStripeConfigured } = await import("@/lib/stripe");
    expect(isStripeConfigured()).toBe(false);

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_123");
    const stripeMod = await import("@/lib/stripe");
    expect(stripeMod.isStripeConfigured()).toBe(true);
  });

  it("getStripe throws when STRIPE_SECRET_KEY is missing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { getStripe } = await import("@/lib/stripe");
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY is not set/);
  });

  it("getStripe creates a Stripe client with the secret key", async () => {
    const StripeMock = vi.fn().mockImplementation(function Stripe(this: unknown) {
      return { __mocked: true };
    });
    vi.doMock("stripe", () => ({ default: StripeMock }));
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");

    const { getStripe } = await import("@/lib/stripe");
    const client = getStripe();
    expect(StripeMock).toHaveBeenCalledWith("sk_test_abc");
    expect(client).toEqual({ __mocked: true });

    // singleton reuse
    const again = getStripe();
    expect(StripeMock).toHaveBeenCalledTimes(1);
    expect(again).toBe(client);
  });
});
