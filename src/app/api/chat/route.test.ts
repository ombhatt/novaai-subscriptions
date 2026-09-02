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
    expect(admin.rpc).toHaveBeenCalledWith("increment_usage", { p_user_id: "user-1" });
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
