import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/mocks/supabase";

const { createAdminClientMock, getStripeMock, downgradeToFreeMock } = vi.hoisted(
  () => ({
    createAdminClientMock: vi.fn(),
    getStripeMock: vi.fn(),
    downgradeToFreeMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: getStripeMock,
}));

vi.mock("@/lib/stripe-webhook-handler", () => ({
  downgradeToFree: downgradeToFreeMock,
}));

import { cancelExpiredDunningSubscriptions } from "@/lib/dunning-cron";
import { GET, POST } from "@/app/api/cron/dunning/route";

describe("cancelExpiredDunningSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downgradeToFreeMock.mockResolvedValue(undefined);
  });

  it("cancels Stripe subscriptions whose grace has elapsed", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: [
            {
              user_id: "user-1",
              stripe_customer_id: "cus_1",
              stripe_subscription_id: "sub_expired",
            },
          ],
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    const cancel = vi.fn().mockResolvedValue({ id: "sub_expired" });
    getStripeMock.mockReturnValue({ subscriptions: { cancel } });

    const result = await cancelExpiredDunningSubscriptions(
      new Date("2026-09-12T00:00:00.000Z"),
    );

    expect(cancel).toHaveBeenCalledWith("sub_expired");
    expect(downgradeToFreeMock).toHaveBeenCalledWith("user-1", "cus_1");
    expect(result).toEqual({ canceled: 1, failed: 0, errors: [] });
  });

  it("skips the sweep when there are no expired rows", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: { data: [], error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    const cancel = vi.fn();
    getStripeMock.mockReturnValue({ subscriptions: { cancel } });

    const result = await cancelExpiredDunningSubscriptions();

    expect(cancel).not.toHaveBeenCalled();
    expect(result.canceled).toBe(0);
  });
});

describe("GET/POST /api/cron/dunning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  it("returns 500 when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(new Request("http://localhost/api/cron/dunning"));
    expect(response.status).toBe(500);
  });

  it("returns 401 without a bearer token", async () => {
    const response = await POST(new Request("http://localhost/api/cron/dunning", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("runs the sweep when authorized", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: { data: [], error: null },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    getStripeMock.mockReturnValue({ subscriptions: { cancel: vi.fn() } });

    const response = await GET(
      new Request("http://localhost/api/cron/dunning", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      canceled: 0,
      failed: 0,
      errors: [],
    });
  });
});
