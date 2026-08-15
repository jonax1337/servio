import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { loginRetryAfter, recordLoginFailure, recordLoginSuccess } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const providers: Provider[] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      // Throttle brute force per-IP AND per-account (lockout + exponential
      // backoff on repeated failures). In-memory, single-instance — see
      // lib/rate-limit.ts. A throttled attempt is rejected before any bcrypt.
      const fwd = request?.headers?.get?.("x-forwarded-for") ?? "";
      const ip = fwd.split(",")[0].trim() || request?.headers?.get?.("x-real-ip")?.trim() || "unknown";
      const accountKey = `login:acct:${email.toLowerCase()}`;
      const ipKey = `login:ip:${ip}`;
      if (loginRetryAfter(accountKey) > 0 || loginRetryAfter(ipKey) > 0) return null;

      const user = await db.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (!user || !user.passwordHash || !user.isActive) {
        recordLoginFailure(ipKey);
        recordLoginFailure(accountKey);
        return null;
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        recordLoginFailure(ipKey);
        recordLoginFailure(accountKey);
        return null;
      }

      recordLoginSuccess(ipKey);
      recordLoginSuccess(accountKey);

      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
      };
    },
  }),
];

// Optional SSO / OIDC — only registered when configured.
if (process.env.AUTH_OIDC_ID && process.env.AUTH_OIDC_ISSUER) {
  providers.push({
    id: "oidc",
    name: process.env.AUTH_OIDC_NAME || "SSO",
    type: "oidc",
    issuer: process.env.AUTH_OIDC_ISSUER,
    clientId: process.env.AUTH_OIDC_ID,
    clientSecret: process.env.AUTH_OIDC_SECRET,
    allowDangerousEmailAccountLinking: true,
  });
}

export const ssoEnabled = Boolean(
  process.env.AUTH_OIDC_ID && process.env.AUTH_OIDC_ISSUER,
);
export const ssoProviderName = process.env.AUTH_OIDC_NAME || "SSO";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers,
});
