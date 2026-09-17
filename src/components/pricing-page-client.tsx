"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EnterpriseInquiryForm } from "@/components/enterprise-inquiry-form";
import { PricingCards } from "@/components/pricing-cards";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PromoDiscount } from "@/lib/promo";
import { isCheckoutTier, isPaidTier, type Tier } from "@/lib/tiers";

export const PROMO_CODE_HINT =
  "Optional. We'll apply a valid code automatically at checkout. First-invoice discounts show on the cards; the monthly rate stays the same.";

export function PricingPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentTier, setCurrentTier] = useState<Tier>("free");
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState(() => searchParams.get("promo") ?? "");
  const [promoDiscount, setPromoDiscount] = useState<{
    code: string;
    discount: PromoDiscount;
  } | null>(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquiryEmail, setInquiryEmail] = useState("");
  const trimmedPromo = promoCode.trim();
  const visiblePromoDiscount =
    promoDiscount?.code === trimmedPromo ? promoDiscount.discount : null;

  useEffect(() => {
    fetch("/api/subscription")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tier) setCurrentTier(data.tier);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!trimmedPromo) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      fetch(`/api/promo?code=${encodeURIComponent(trimmedPromo)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (cancelled) return;
          if (!json?.valid) {
            setPromoDiscount(null);
            return;
          }
          setPromoDiscount({
            code: trimmedPromo,
            discount: {
              percentOff: json.percentOff ?? null,
              amountOffCents: json.amountOffCents ?? null,
              duration:
                json.duration === "repeating" || json.duration === "forever"
                  ? json.duration
                  : "once",
            },
          });
        })
        .catch(() => {
          if (!cancelled) setPromoDiscount(null);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [trimmedPromo]);

  async function handleSelectTier(tier: Tier) {
    setError(null);

    if (tier === "enterprise") {
      setLoadingTier(null);
      try {
        const meResponse = await fetch("/api/me");
        const me = (await meResponse.json()) as {
          user?: { email?: string | null } | null;
        };
        setInquiryEmail(me.user?.email ?? "");
      } catch {
        setInquiryEmail("");
      }
      setShowInquiry(true);
      return;
    }

    if (tier === "free") {
      if (!isPaidTier(currentTier)) {
        return;
      }

      setLoadingTier("free");
      try {
        const response = await fetch("/api/subscription/cancel", { method: "POST" });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error ?? "Failed to schedule cancellation");
        }
        window.location.href = "/dashboard";
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to schedule cancellation",
        );
        setLoadingTier(null);
      }
      return;
    }

    setLoadingTier(tier);

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

    const switchingPaidPlan =
      isPaidTier(currentTier) && isCheckoutTier(tier) && tier !== currentTier;

    try {
      const response = await fetch(
        switchingPaidPlan ? "/api/subscription/change" : "/api/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            switchingPaidPlan
              ? { tier }
              : {
                  tier,
                  ...(trimmedPromo ? { promoCode: trimmedPromo } : {}),
                },
          ),
        },
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ??
            (switchingPaidPlan ? "Failed to change plan" : "Checkout failed"),
        );
      }

      window.location.href = json.url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : switchingPaidPlan
            ? "Failed to change plan"
            : "Checkout failed",
      );
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
          {PROMO_CODE_HINT}
        </p>
      </div>
      <PricingCards
        currentTier={currentTier}
        onSelectTier={handleSelectTier}
        loadingTier={loadingTier}
        promoDiscount={visiblePromoDiscount}
      />
      <Dialog open={showInquiry} onOpenChange={setShowInquiry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Talk to sales</DialogTitle>
            <DialogDescription>
              Tell us about your team. This does not start a Stripe checkout.
            </DialogDescription>
          </DialogHeader>
          <EnterpriseInquiryForm
            key={inquiryEmail}
            initialEmail={inquiryEmail}
            promoCode={promoCode}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
