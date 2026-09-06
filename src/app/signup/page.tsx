import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export default function SignupPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-16">
        <h1 className="sr-only">Create your account</h1>
        <AuthForm mode="signup" />
      </main>
    </div>
  );
}
