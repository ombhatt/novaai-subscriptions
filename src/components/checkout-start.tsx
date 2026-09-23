"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { checkoutResumePath, checkoutTierFromPlan } from "@/lib/checkout-resume";
import { TIER_LIMITS } from "@/lib/tiers";

export function CheckoutStart() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const promo = searchParams.get("promo");
  const tier = checkoutTierFromPlan(plan);
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tier) {
      router.replace("/pricing");
      return;
    }

    if (started.current) return;
    started.current = true;

    const trimmedPromo = promo?.trim();
    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier,
        ...(trimmedPromo ? { promoCode: trimmedPromo } : {}),
      }),
    })
      .then(async (response) => {
        const json = (await response.json()) as { url?: string; error?: string };
        if (response.status === 401) {
          const resume = checkoutResumePath(tier, trimmedPromo);
          const params = resume ? new URL(resume, "http://localhost").search : "";
          router.replace(`/login${params}`);
          return;
        }
        if (!response.ok || !json.url) {
          throw new Error(json.error ?? "Checkout failed");
        }
        window.location.href = json.url;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Checkout failed");
      });
  }, [plan, promo, router, tier]);

  if (!tier) {
    return null;
  }

  return (
    <div className="mx-auto max-w-md text-center" data-testid="checkout-start">
      <h1 className="text-2xl font-semibold tracking-tight">
        {error ? "Checkout didn't start" : `Continuing to ${TIER_LIMITS[tier].label}`}
      </h1>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Taking you to checkout…</p>
      )}
    </div>
  );
}
