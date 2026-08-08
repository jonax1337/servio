import NextAuth, { type Provider } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";

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
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      const user = await db.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (!user || !user.passwordHash || !user.isActive) return null;

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;

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
