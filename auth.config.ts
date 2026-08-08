import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config. No Prisma / bcrypt here so it can run in middleware.
 * The heavy providers (Credentials, OIDC) are added in auth.ts (Node runtime).
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        // role comes from the DB user record (Credentials authorize or Prisma adapter)
        token.role = (user as { role?: string }).role ?? "USER";
        token.picture = user.image ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.role = (token.role as string) ?? "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
