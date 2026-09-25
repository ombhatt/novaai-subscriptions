"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  isCheckoutTier,
  isPaidTier,
  parseBillingInterval,
  type BillingInterval,
  type Tier,
} from "@/lib/tiers";

export const PROMO_CODE_HINT =
  "Optional. We'll apply a valid code automatically at checkout. First-invoice discounts show on the cards; the monthly rate stays the same.";

export const PROMO_CODE_HINT_ANNUAL =
  "Optional. We'll apply a valid code automatically at checkout. First-invoice discounts show on the cards; the yearly rate stays the same.";

export function PricingPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentTier, setCurrentTier] = useState<Tier>("free");
  const [currentInterval, setCurrentInterval] = useState<BillingInterval>("month");
  const [hasPendingChange, setHasPendingChange] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>(() =>
    parseBillingInterval(searchParams.get("interval")),
  );
  const intervalTouched = useRef(searchParams.get("interval") === "year");
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
        const billingInterval = parseBillingInterval(data?.subscription?.billing_interval);
        setHasPendingChange(Boolean(data?.subscription?.pending_tier));
        if (data?.subscription?.billing_interval) {
          setCurrentInterval(billingInterval);
          if (!intervalTouched.current) setInterval(billingInterval);
        }
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
              durationInMonths:
                typeof json.durationInMonths === "number"
                  ? json.durationInMonths
                  : null,
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
      if (interval === "year") params.set("interval", "year");
      if (trimmedPromo) {
        params.set("promo", trimmedPromo);
      }
      router.push(`/signup?${params.toString()}`);
      return;
    }

    const switchingPaidPlan =
      isPaidTier(currentTier) &&
      isCheckoutTier(tier) &&
      (tier !== currentTier || interval !== currentInterval || hasPendingChange);

    try {
      const response = await fetch(
        switchingPaidPlan ? "/api/subscription/change" : "/api/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            switchingPaidPlan
              ? { tier, interval }
              : {
                  tier,
                  interval,
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
          {interval === "year" ? PROMO_CODE_HINT_ANNUAL : PROMO_CODE_HINT}
        </p>
      </div>
      <div
        role="group"
        aria-label="Billing interval"
        className="mx-auto mb-8 flex w-fit gap-2"
      >
        <button
          type="button"
          className={`rounded-md border px-4 py-2 text-sm ${
            interval === "month" ? "bg-primary text-primary-foreground" : ""
          }`}
          aria-pressed={interval === "month"}
          onClick={() => {
            intervalTouched.current = true;
            setInterval("month");
          }}
        >
          Monthly
        </button>
        <button
          type="button"
          className={`rounded-md border px-4 py-2 text-sm ${
            interval === "year" ? "bg-primary text-primary-foreground" : ""
          }`}
          aria-pressed={interval === "year"}
          onClick={() => {
            intervalTouched.current = true;
            setInterval("year");
          }}
        >
          Annual
        </button>
      </div>
      <PricingCards
        currentTier={currentTier}
        billingInterval={currentInterval}
        selectedInterval={interval}
        onSelectTier={handleSelectTier}
        loadingTier={loadingTier}
        promoDiscount={visiblePromoDiscount}
        hasPendingChange={hasPendingChange}
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
