import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { ssoEnabled, ssoProviderName } from "@/auth";
import { Wordmark } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const highlights = [
  "Tickets, Problems & Changes — full ITIL flow",
  "CMDB with asset dependency mapping",
  "SSO, self-service portal & a clean REST API",
  "Sync users & assets from AD, Azure, Intune…",
];

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Left: brand / marketing panel */}
      <div className="relative hidden overflow-hidden border-r bg-sidebar lg:block">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="absolute -left-24 top-1/3 size-[36rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Wordmark subtitle="Open-Source ITSM" />
          <div className="max-w-md">
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
              The service desk your team{" "}
              <span className="text-primary">actually enjoys</span>.
            </h1>
            <p className="mt-4 text-muted-foreground">
              A modern, open-source alternative to legacy ITSM. Everything from
              incidents to infrastructure sync — in one fast, beautiful place.
            </p>
            <ul className="mt-8 grid gap-3">
              {highlights.map((h) => (
                <li key={h} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Servio · MIT licensed
          </p>
        </div>
      </div>

      {/* Right: sign-in */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark subtitle="Open-Source ITSM" />
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6 grid gap-1.5">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Welcome back
              </h2>
              <p className="text-sm text-muted-foreground">
                Sign in to your Servio workspace.
              </p>
            </div>
            <Suspense>
              <LoginForm ssoEnabled={ssoEnabled} ssoName={ssoProviderName} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
