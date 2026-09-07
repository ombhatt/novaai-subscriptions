import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/mocks/supabase";

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

import { POST } from "@/app/api/sales-inquiry/route";

describe("POST /api/sales-inquiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/sales-inquiry", {
        method: "POST",
        body: JSON.stringify({ company: "Acme" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("stores a guest inquiry", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    const admin = createSupabaseMock({ user: null });
    createAdminClientMock.mockReturnValue(admin);

    const response = await POST(
      new Request("http://localhost/api/sales-inquiry", {
        method: "POST",
        body: JSON.stringify({
          email: "  lead@acme.com ",
          company: "Acme",
          note: "Need invoicing",
          promoCode: "WELCOME20",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(admin.from).toHaveBeenCalledWith("sales_inquiries");
    expect(admin.builders.sales_inquiries.builder.lastInsert).toEqual({
      user_id: null,
      email: "lead@acme.com",
      company: "Acme",
      note: "Need invoicing",
      source: "pricing_enterprise",
      promo_code: "WELCOME20",
    });
  });

  it("attaches the signed-in user id", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "user-9", email: "a@b.com" } }),
    );
    const admin = createSupabaseMock();
    createAdminClientMock.mockReturnValue(admin);

    const response = await POST(
      new Request("http://localhost/api/sales-inquiry", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.com" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(admin.builders.sales_inquiries.builder.lastInsert).toMatchObject({
      user_id: "user-9",
      email: "a@b.com",
      company: null,
      note: null,
      promo_code: null,
    });
  });

  it("returns 503 when the admin client is missing", async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({ user: null }));
    createAdminClientMock.mockImplementation(() => {
      throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL");
    });

    const response = await POST(
      new Request("http://localhost/api/sales-inquiry", {
        method: "POST",
        body: JSON.stringify({ email: "lead@acme.com" }),
      }),
    );

    expect(response.status).toBe(503);
  });
});
