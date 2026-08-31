import { SiteHeader } from "@/components/site-header";
import { PricingPageClient } from "@/components/pricing-page-client";

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple pricing for every stage
          </h1>
          <p className="mt-4 text-muted-foreground">
            Start free and upgrade when you need more requests, better models, or priority
            support. All plans bill monthly through Stripe.
          </p>
        </div>
        <PricingPageClient />
      </main>
    </div>
  );
}
