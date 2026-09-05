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

  it("throws when the subscription query fails", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: { data: null, error: { message: "db down" } },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await expect(cancelExpiredDunningSubscriptions()).rejects.toThrow(
      /Failed to load expired dunning subscriptions: db down/,
    );
  });

  it("treats already-canceled Stripe errors as success", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: [
            {
              user_id: "user-1",
              stripe_customer_id: null,
              stripe_subscription_id: "sub_gone",
            },
          ],
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    getStripeMock.mockReturnValue({
      subscriptions: {
        cancel: vi.fn().mockRejectedValue(new Error("No such subscription")),
      },
    });

    const result = await cancelExpiredDunningSubscriptions();

    expect(downgradeToFreeMock).toHaveBeenCalledWith("user-1", undefined);
    expect(result).toEqual({ canceled: 1, failed: 0, errors: [] });
  });

  it("records failures when cancel or downgrade throws", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: [
            {
              user_id: "user-1",
              stripe_customer_id: "cus_1",
              stripe_subscription_id: "sub_fail",
            },
          ],
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    getStripeMock.mockReturnValue({
      subscriptions: {
        cancel: vi.fn().mockRejectedValue(new Error("card network down")),
      },
    });

    const result = await cancelExpiredDunningSubscriptions();

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toMatch(/sub_fail: card network down/);
  });

  it("stringifies non-Error sweep failures", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: [
            {
              user_id: "user-1",
              stripe_customer_id: "cus_1",
              stripe_subscription_id: "sub_boom",
            },
          ],
          error: null,
        },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);
    getStripeMock.mockReturnValue({
      subscriptions: { cancel: vi.fn().mockRejectedValue("hard fail") },
    });

    const result = await cancelExpiredDunningSubscriptions();

    expect(result.errors[0]).toMatch(/sub_boom: Unknown dunning error/);
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

  it("returns 500 when the sweep throws", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("admin missing");
    });

    const response = await POST(
      new Request("http://localhost/api/cron/dunning", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "admin missing" });
  });

  it("returns a generic 500 when the sweep throws a non-Error", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw "boom";
    });

    const response = await GET(
      new Request("http://localhost/api/cron/dunning", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Dunning sweep failed",
    });
  });
});
