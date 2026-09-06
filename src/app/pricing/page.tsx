import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { PricingPageClient } from "@/components/pricing-page-client";
import { PricingCards } from "@/components/pricing-cards";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function PricingFallback() {
  return (
    <>
      <div className="mx-auto mb-8 max-w-sm">
        <Label htmlFor="promo-code">Promo code</Label>
        <Input
          id="promo-code"
          data-testid="promo-code"
          className="mt-2"
          placeholder="WELCOME20"
          disabled
          aria-describedby="promo-code-hint"
        />
        <p id="promo-code-hint" className="mt-1 text-xs text-muted-foreground">
          Optional. The discount is applied on the Stripe checkout page.
        </p>
      </div>
      <PricingCards />
    </>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple pricing for every stage
          </h1>
          <p className="mt-4 text-muted-foreground">
            Start free and upgrade when you need more requests, better models, or priority
            support. All plans bill monthly through Stripe.
          </p>
        </div>
        <Suspense fallback={<PricingFallback />}>
          <PricingPageClient />
        </Suspense>
      </main>
    </div>
  );
}
