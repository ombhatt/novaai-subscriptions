import { SiteHeader } from "@/components/site-header";
import { DashboardClient } from "@/components/dashboard-client";

export default function DashboardPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Monitor your plan, usage, and test API requests.
          </p>
        </div>
        <DashboardClient />
      </main>
    </div>
  );
}
