import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("supabase admin client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@supabase/supabase-js");
  });

  it("throws when env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    expect(() => createAdminClient()).toThrow(/requires NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("creates a client with service role options", async () => {
    const createClient = vi.fn().mockReturnValue({ admin: true });
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");

    const { createAdminClient, isSupabaseConfigured } = await import(
      "@/lib/supabase/admin"
    );
    expect(isSupabaseConfigured()).toBe(true);
    expect(createAdminClient()).toEqual({ admin: true });
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role",
      expect.objectContaining({
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    );
  });
});

describe("supabase browser client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@supabase/ssr");
  });

  it("throws when public env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { createClient } = await import("@/lib/supabase/client");
    expect(() => createClient()).toThrow(/requires NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("creates a browser client", async () => {
    const createBrowserClient = vi.fn().mockReturnValue({ browser: true });
    vi.doMock("@supabase/ssr", () => ({ createBrowserClient }));
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");

    const { createClient } = await import("@/lib/supabase/client");
    expect(createClient()).toEqual({ browser: true });
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon",
    );
  });
});
