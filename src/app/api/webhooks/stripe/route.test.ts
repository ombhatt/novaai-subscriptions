import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStripeMock,
  handleStripeWebhookEventMock,
  headersMock,
} = vi.hoisted(() => ({
  getStripeMock: vi.fn(),
  handleStripeWebhookEventMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

vi.mock("@/lib/stripe-webhook-handler", () => ({
  handleStripeWebhookEvent: handleStripeWebhookEventMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

import { POST } from "@/app/api/webhooks/stripe/route";

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  });

  it("returns 500 when webhook secret is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const response = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(response.status).toBe(500);
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    headersMock.mockResolvedValue({
      get: () => null,
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing stripe-signature header.",
    });
  });

  it("returns 400 for invalid signatures", async () => {
    headersMock.mockResolvedValue({
      get: () => "bad-sig",
    });
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => {
          throw new Error("Invalid signature");
        }),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid signature" });
  });

  it("handles a valid webhook event", async () => {
    const event = { id: "evt_1", type: "invoice.paid" };
    headersMock.mockResolvedValue({
      get: () => "sig_test",
    });
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue(event),
      },
    });
    handleStripeWebhookEventMock.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{\"ok\":true}",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(handleStripeWebhookEventMock).toHaveBeenCalledWith(event);
  });

  it("returns 500 when handler throws", async () => {
    headersMock.mockResolvedValue({
      get: () => "sig_test",
    });
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({ id: "evt_1", type: "ping" }),
      },
    });
    handleStripeWebhookEventMock.mockRejectedValue(new Error("db down"));

    const response = await POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "db down" });
  });
});
