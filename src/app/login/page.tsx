import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <AuthForm mode="login" />
      </main>
    </div>
  );
}
