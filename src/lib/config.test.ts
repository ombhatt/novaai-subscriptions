import { describe, expect, it, vi, afterEach } from "vitest";
import { isStripeConfigured, isSupabaseConfigured } from "@/lib/config";

describe("isSupabaseConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when env vars are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns true when both public Supabase vars are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    expect(isSupabaseConfigured()).toBe(true);
  });
});

describe("isStripeConfigured (config)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false without publishable key", () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(isStripeConfigured()).toBe(false);
  });

  it("returns true when publishable key and supabase url are set", () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_123");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(isStripeConfigured()).toBe(true);
  });
});
