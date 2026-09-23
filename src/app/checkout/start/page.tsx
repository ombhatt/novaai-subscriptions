import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { CheckoutStart } from "@/components/checkout-start";

export default function CheckoutStartPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" className="px-4 py-16">
        <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Taking you to checkout…</p>}>
          <CheckoutStart />
        </Suspense>
      </main>
    </div>
  );
}
