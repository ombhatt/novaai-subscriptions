import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EnterpriseInquiryForm } from "@/components/enterprise-inquiry-form";

describe("EnterpriseInquiryForm", () => {
  it("submits an inquiry and shows a confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    render(<EnterpriseInquiryForm promoCode="WELCOME20" />);
    await user.type(screen.getByLabelText("Work email"), "lead@acme.com");
    await user.type(screen.getByLabelText("Company"), "Acme");
    await user.click(screen.getByRole("button", { name: "Send inquiry" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sales-inquiry",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      email: "lead@acme.com",
      company: "Acme",
      note: "",
      source: "pricing_enterprise",
      promoCode: "WELCOME20",
    });
    expect(await screen.findByTestId("enterprise-inquiry-success")).toHaveTextContent(
      "lead@acme.com",
    );
  });

  it("shows an API error in an alert", async () => {
    const user = userEvent.setup();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "A valid work email is required." }), {
        status: 400,
      }),
    );

    render(<EnterpriseInquiryForm initialEmail="lead@acme.com" />);
    await user.click(screen.getByRole("button", { name: "Send inquiry" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A valid work email is required.",
    );
  });
});
