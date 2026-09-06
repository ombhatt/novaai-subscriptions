"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PricingCards } from "@/components/pricing-cards";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Tier } from "@/lib/tiers";

export function PricingPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentTier, setCurrentTier] = useState<Tier>("free");
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState(() => searchParams.get("promo") ?? "");

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tier) setCurrentTier(data.tier);
      })
      .catch(() => undefined);
  }, []);

  async function handleSelectTier(tier: Tier) {
    setError(null);
    setLoadingTier(tier);

    const trimmedPromo = promoCode.trim();

    const meResponse = await fetch("/api/me");
    const me = await meResponse.json();

    if (!me.user) {
      const params = new URLSearchParams({ plan: tier });
      if (trimmedPromo) {
        params.set("promo", trimmedPromo);
      }
      router.push(`/signup?${params.toString()}`);
      return;
    }

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          ...(trimmedPromo ? { promoCode: trimmedPromo } : {}),
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Checkout failed");
      }

      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoadingTier(null);
    }
  }

  return (
    <>
      {error && (
        <p
          id="checkout-error"
          role="alert"
          data-testid="checkout-error"
          className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="mx-auto mb-8 max-w-sm">
        <Label htmlFor="promo-code">Promo code</Label>
        <Input
          id="promo-code"
          data-testid="promo-code"
          className="mt-2"
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value)}
          placeholder="WELCOME20"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? "promo-code-hint checkout-error" : "promo-code-hint"
          }
        />
        <p id="promo-code-hint" className="mt-1 text-xs text-muted-foreground">
          Optional. The discount is applied on the Stripe checkout page.
        </p>
      </div>
      <PricingCards
        currentTier={currentTier}
        onSelectTier={handleSelectTier}
        loadingTier={loadingTier}
      />
    </>
  );
}
