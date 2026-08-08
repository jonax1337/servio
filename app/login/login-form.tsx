"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import { authenticate, ssoSignIn, type LoginState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm({
  ssoEnabled,
  ssoName,
}: {
  ssoEnabled: boolean;
  ssoName: string;
}) {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const [state, action, pending] = useActionState<LoginState, FormData>(
    authenticate,
    undefined,
  );

  return (
    <div className="grid gap-5">
      {ssoEnabled ? (
        <>
          <form action={() => ssoSignIn(callbackUrl)}>
            <Button type="submit" variant="outline" className="w-full" size="lg">
              <ShieldCheck className="size-4" />
              Continue with {ssoName}
            </Button>
          </form>
          <div className="relative">
            <Separator />
            <span className="absolute inset-0 -top-2.5 mx-auto w-fit bg-card px-2 text-xs text-muted-foreground">
              or sign in with email
            </span>
          </div>
        </>
      ) : null}

      <form action={action} className="grid gap-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            defaultValue="admin@servio.dev"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            defaultValue="servio123"
            required
          />
        </div>

        {state?.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogIn className="size-4" />
          )}
          Sign in
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Demo account prefilled ·{" "}
        <span className="font-mono">admin@servio.dev</span> /{" "}
        <span className="font-mono">servio123</span>
      </p>
    </div>
  );
}
