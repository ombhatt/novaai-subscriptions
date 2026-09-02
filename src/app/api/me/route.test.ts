import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/mocks/supabase";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { GET } from "@/app/api/me/route";

describe("GET /api/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null user when unauthenticated", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ user: null });
  });

  it("returns id and email when authenticated", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "user-9", email: "a@b.com" } }),
    );
    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      user: { id: "user-9", email: "a@b.com" },
    });
  });
});
