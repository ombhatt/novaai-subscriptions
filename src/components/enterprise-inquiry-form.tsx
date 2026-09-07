"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EnterpriseInquiryFormProps {
  initialEmail?: string;
  promoCode?: string;
}

export function EnterpriseInquiryForm({
  initialEmail = "",
  promoCode,
}: EnterpriseInquiryFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [company, setCompany] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/sales-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          company,
          note,
          source: "pricing_enterprise",
          ...(promoCode?.trim() ? { promoCode: promoCode.trim() } : {}),
        }),
      });
      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(json.error ?? "Could not send your inquiry.");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your inquiry.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <p
        role="status"
        data-testid="enterprise-inquiry-success"
        className="rounded-lg border bg-muted/50 px-4 py-3 text-sm"
      >
        Thanks — we received your inquiry and will follow up at {email}.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="enterprise-inquiry-form"
      className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-6"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Talk to sales</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us about your team. This does not start a Stripe checkout.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="enterprise-email">Work email</Label>
        <Input
          id="enterprise-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "enterprise-inquiry-error" : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="enterprise-company">Company</Label>
        <Input
          id="enterprise-company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          autoComplete="organization"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="enterprise-note">What do you need?</Label>
        <textarea
          id="enterprise-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="h-auto min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {error && (
        <p
          id="enterprise-inquiry-error"
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Sending…" : "Send inquiry"}
      </Button>
    </form>
  );
}
