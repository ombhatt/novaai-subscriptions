import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, makeSubscription } from "@/test/mocks/supabase";
import { TIER_LIMITS } from "@/lib/tiers";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { GET } from "@/app/api/subscription/route";

describe("GET /api/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns subscription usage and tier details", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: {
            data: makeSubscription({ tier: "plus", status: "active" }),
            error: null,
          },
          usage_counters: {
            data: { request_count: 42 },
            error: null,
          },
        },
      }),
    );

    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.tier).toBe("plus");
    expect(json.usage).toBe(42);
    expect(json.limit).toBe(TIER_LIMITS.plus.requestsPerMonth);
    expect(json.remaining).toBe(TIER_LIMITS.plus.requestsPerMonth - 42);
    expect(json.tierDetails).toEqual(TIER_LIMITS.plus);
  });

  it("defaults to free when no subscription row exists", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        fromResults: {
          subscriptions: { data: null, error: null },
          usage_counters: { data: null, error: null },
        },
      }),
    );

    const response = await GET();
    const json = await response.json();
    expect(json.tier).toBe("free");
    expect(json.usage).toBe(0);
    expect(json.limit).toBe(TIER_LIMITS.free.requestsPerMonth);
  });
});
