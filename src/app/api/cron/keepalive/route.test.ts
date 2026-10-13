import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/mocks/supabase";

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import { recordDatabaseKeepalive } from "@/lib/keepalive-cron";
import { GET, POST } from "@/app/api/cron/keepalive/route";

function mockReads() {
  const supabase = createSupabaseMock({
    fromResults: {
      subscriptions: { data: [{ id: "sub-1" }], error: null },
      profiles: { data: [{ id: "user-1" }], error: null },
      usage_counters: { data: [{ id: "usage-1" }], error: null },
    },
  });
  createAdminClientMock.mockReturnValue(supabase);
  return supabase;
}

describe("recordDatabaseKeepalive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a row from each keepalive table", async () => {
    const supabase = mockReads();

    const result = await recordDatabaseKeepalive();

    expect(supabase.from).toHaveBeenCalledWith("subscriptions");
    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(supabase.from).toHaveBeenCalledWith("usage_counters");
    expect(supabase.builders.subscriptions.builder.select).toHaveBeenCalledWith("id");
    expect(supabase.builders.subscriptions.builder.limit).toHaveBeenCalledWith(1);
    expect(supabase.builders.profiles.builder.limit).toHaveBeenCalledWith(1);
    expect(supabase.builders.usage_counters.builder.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({ reads: 3 });
  });

  it("throws when a table read fails", async () => {
    const supabase = createSupabaseMock({
      fromResults: {
        subscriptions: { data: [], error: null },
        profiles: { data: null, error: { message: "db down" } },
      },
    });
    createAdminClientMock.mockReturnValue(supabase);

    await expect(recordDatabaseKeepalive()).rejects.toThrow(
      /Failed to read profiles for keepalive: db down/,
    );
    expect(supabase.from).not.toHaveBeenCalledWith("usage_counters");
  });
});

describe("GET/POST /api/cron/keepalive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  it("returns 500 when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(new Request("http://localhost/api/cron/keepalive"));
    expect(response.status).toBe(500);
  });

  it("returns 401 without a bearer token", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/keepalive", { method: "POST" }),
    );
    expect(response.status).toBe(401);
  });

  it("reads the database when authorized", async () => {
    mockReads();

    const response = await GET(
      new Request("http://localhost/api/cron/keepalive", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, reads: 3 });
    expect(createAdminClientMock).toHaveBeenCalled();
  });

  it("returns 500 when a read throws", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw new Error("admin missing");
    });

    const response = await POST(
      new Request("http://localhost/api/cron/keepalive", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "admin missing" });
  });

  it("returns a generic 500 when a read throws a non-Error", async () => {
    createAdminClientMock.mockImplementation(() => {
      throw "boom";
    });

    const response = await GET(
      new Request("http://localhost/api/cron/keepalive", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Keepalive read failed",
    });
  });
});
