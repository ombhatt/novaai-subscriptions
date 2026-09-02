"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PricingCards } from "@/components/pricing-cards";
import { SiteHeader } from "@/components/site-header";
import type { Tier } from "@/lib/tiers";

export function PricingPageClient() {
  const router = useRouter();
  const [currentTier, setCurrentTier] = useState<Tier>("free");
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);

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

    const meResponse = await fetch("/api/me");
    const me = await meResponse.json();

    if (!me.user) {
      router.push(`/signup?plan=${tier}`);
      return;
    }

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
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
          data-testid="checkout-error"
          className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <PricingCards
        currentTier={currentTier}
        onSelectTier={handleSelectTier}
        loadingTier={loadingTier}
      />
    </>
  );
}
