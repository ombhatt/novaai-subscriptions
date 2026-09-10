import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/mocks/supabase";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login when code is missing", async () => {
    const response = await GET(
      new Request("http://localhost:43123/auth/callback"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:43123/login?error=auth",
    );
  });

  it("exchanges code and redirects to next path", async () => {
    const supabase = createSupabaseMock();
    createClientMock.mockResolvedValue(supabase);

    const response = await GET(
      new Request("http://localhost:43123/auth/callback?code=abc&next=/pricing"),
    );

    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("http://localhost:43123/pricing");
  });

  it.each(["@evil.example", "//evil.example", "/\\evil.example"])(
    "falls back to the dashboard for unsafe next path %s",
    async (next) => {
      createClientMock.mockResolvedValue(createSupabaseMock());

      const response = await GET(
        new Request(
          `http://localhost:43123/auth/callback?code=abc&next=${encodeURIComponent(next)}`,
        ),
      );

      expect(response.headers.get("location")).toBe(
        "http://localhost:43123/dashboard",
      );
    },
  );

  it("redirects to login when exchange fails", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ exchangeError: new Error("bad code") }),
    );

    const response = await GET(
      new Request("http://localhost:43123/auth/callback?code=bad"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:43123/login?error=auth",
    );
  });
});
