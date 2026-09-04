import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock, makeSubscription } from "@/test/mocks/supabase";

const { createClientMock, createAdminClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import { POST } from "@/app/api/chat/route";

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when prompt is missing", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock());

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "prompt is required" });
  });

  it("returns 429 when monthly limit is reached", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({ tier: "free" }),
          error: null,
        },
        usage_counters: {
          data: { request_count: 1000 },
          error: null,
        },
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    );

    expect(response.status).toBe(429);
    const json = await response.json();
    expect(json.error).toMatch(/Monthly limit/);
  });

  it("returns 402 when subscription is past_due", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({ tier: "plus", status: "past_due" }),
          error: null,
        },
        usage_counters: { data: { request_count: 0 }, error: null },
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    );

    expect(response.status).toBe(402);
  });

  it("allows past_due Plus requests during the 7-day grace period", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({
            tier: "plus",
            status: "past_due",
            grace_period_ends_at: "2099-01-01T00:00:00.000Z",
          }),
          error: null,
        },
        usage_counters: { data: { request_count: 0 }, error: null },
      },
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      createSupabaseMock({
        rpcResult: { data: 1, error: null },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("processes a valid request and increments usage", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({ tier: "plus" }),
          error: null,
        },
        usage_counters: { data: { request_count: 5 }, error: null },
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const admin = createSupabaseMock({
      rpcResult: { data: 6, error: null },
    });
    createAdminClientMock.mockReturnValue(admin);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "Summarize this" }),
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.tier).toBe("plus");
    expect(json.model).toBe("standard");
    expect(json.usage).toBe(6);
    expect(json.reply).toContain("Summarize this");
    expect(admin.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_user_id: "user-1",
      p_limit: 100,
    });
    expect(admin.rpc).toHaveBeenCalledWith("increment_usage", {
      p_user_id: "user-1",
      p_period_start: expect.stringMatching(/^\d{4}-\d{2}-01$/),
    });
  });

  it("returns 429 when the per-minute rate limit is exhausted", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({ tier: "free" }),
          error: null,
        },
        usage_counters: { data: { request_count: 0 }, error: null },
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const admin = createSupabaseMock({
      rpcResults: {
        consume_rate_limit: { data: null, error: null },
      },
    });
    createAdminClientMock.mockReturnValue(admin);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
    const json = await response.json();
    expect(json.code).toBe("rate_limited");
    expect(json.error).toMatch(/requests per minute/);
    expect(json.limit).toBe(10);
    expect(admin.rpc).not.toHaveBeenCalledWith(
      "increment_usage",
      expect.anything(),
    );
  });

  it("increments usage against the Stripe billing period when present", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({
            tier: "plus",
            current_period_start: "2026-09-15T00:00:00.000Z",
          }),
          error: null,
        },
        usage_counters: { data: { request_count: 5 }, error: null },
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const admin = createSupabaseMock({
      rpcResult: { data: 6, error: null },
    });
    createAdminClientMock.mockReturnValue(admin);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("increment_usage", {
      p_user_id: "user-1",
      p_period_start: "2026-09-15",
    });
  });

  it("returns 500 when usage increment fails", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: {
          data: makeSubscription({ tier: "free" }),
          error: null,
        },
        usage_counters: { data: { request_count: 0 }, error: null },
      },
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(
      createSupabaseMock({
        rpcResult: { data: null, error: { message: "rpc failed" } },
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: "hello" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "rpc failed" });
  });
});
