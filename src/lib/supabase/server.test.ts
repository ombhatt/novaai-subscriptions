import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { cookiesMock, createServerClientMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

describe("supabase server client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when public env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { createClient } = await import("@/lib/supabase/server");
    await expect(createClient()).rejects.toThrow(/requires NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("creates a server client and forwards cookies", async () => {
    const set = vi.fn();
    cookiesMock.mockResolvedValue({
      getAll: () => [{ name: "sb", value: "token" }],
      set,
    });
    createServerClientMock.mockImplementation((_url, _key, options) => {
      expect(options.cookies.getAll()).toEqual([{ name: "sb", value: "token" }]);
      options.cookies.setAll([
        { name: "sb", value: "next", options: { path: "/" } },
      ]);
      return { server: true };
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");

    const { createClient } = await import("@/lib/supabase/server");
    await expect(createClient()).resolves.toEqual({ server: true });
    expect(set).toHaveBeenCalledWith("sb", "next", { path: "/" });
  });

  it("swallows setAll errors from Server Components", async () => {
    cookiesMock.mockResolvedValue({
      getAll: () => [],
      set: () => {
        throw new Error("read-only cookies");
      },
    });
    createServerClientMock.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([{ name: "sb", value: "x", options: {} }]);
      return { server: true };
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");

    const { createClient } = await import("@/lib/supabase/server");
    await expect(createClient()).resolves.toEqual({ server: true });
  });
});
