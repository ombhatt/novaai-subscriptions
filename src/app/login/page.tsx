import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AuthForm, AuthFormFromSearchParams } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-16">
        <h1 className="sr-only">Log in</h1>
        <Suspense fallback={<AuthForm mode="login" />}>
          <AuthFormFromSearchParams mode="login" />
        </Suspense>
      </main>
    </div>
  );
}
