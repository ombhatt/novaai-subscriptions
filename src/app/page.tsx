import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Shield, Zap } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              Subscription management MVP
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Ship AI products with simple, predictable pricing
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              NovaAI bundles authentication, tiered entitlements, Stripe billing, and usage
              tracking in one Supabase + Next.js stack. Free, Plus, and Pro — fixed monthly
              prices with clear request limits.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className={buttonVariants({ size: "lg" })}>
                Start for free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link href="/pricing" className={buttonVariants({ size: "lg", variant: "outline" })}>
                View pricing
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
            <div className="space-y-2">
              <Zap className="h-6 w-6 text-primary" />
              <h3 className="font-semibold">Tiered entitlements</h3>
              <p className="text-sm text-muted-foreground">
                Enforce monthly request caps and model access per plan at the API layer.
              </p>
            </div>
            <div className="space-y-2">
              <Shield className="h-6 w-6 text-primary" />
              <h3 className="font-semibold">Stripe billing</h3>
              <p className="text-sm text-muted-foreground">
                Checkout, customer portal, and webhook sync keep subscriptions up to date.
              </p>
            </div>
            <div className="space-y-2">
              <ArrowRight className="h-6 w-6 text-primary" />
              <h3 className="font-semibold">Supabase auth + Postgres</h3>
              <p className="text-sm text-muted-foreground">
                Users, subscriptions, and usage counters live in Postgres with row-level security.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
