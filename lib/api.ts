import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export type ApiPrincipal = {
  tokenId: string;
  userId: string;
  scopes: string[];
  /** Acting user's role — used to scope object access (agents see all). */
  role: string;
};

/** Agents (AGENT/MANAGER/ADMIN) may act org-wide; USERs are scoped to their own objects. */
const AGENT_RANK: Record<string, number> = { USER: 0, AGENT: 1, MANAGER: 2, ADMIN: 3 };
export function principalIsAgent(principal: ApiPrincipal) {
  return (AGENT_RANK[principal.role] ?? 0) >= AGENT_RANK.AGENT;
}

/** Authenticate a request via `Authorization: Bearer <token>`. */
export async function authenticateApi(req: Request): Promise<ApiPrincipal | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const raw = match[1].trim();

  const candidates = await db.apiToken.findMany({
    where: { revoked: false, prefix: raw.slice(0, 18) },
  });
  // fall back to scanning all active tokens if prefix scheme differs
  const pool = candidates.length
    ? candidates
    : await db.apiToken.findMany({ where: { revoked: false } });

  for (const t of pool) {
    if (t.expiresAt && t.expiresAt.getTime() < Date.now()) continue;
    if (await bcrypt.compare(raw, t.tokenHash)) {
      // Resolve the acting user; reject tokens whose owner is deactivated.
      const user = await db.user.findUnique({
        where: { id: t.userId },
        select: { isActive: true, role: true },
      });
      if (!user || !user.isActive) return null;
      await db.apiToken.update({
        where: { id: t.id },
        data: { lastUsedAt: new Date() },
      });
      return {
        tokenId: t.id,
        userId: t.userId,
        scopes: t.scopes.split(",").map((s) => s.trim()),
        role: user.role,
      };
    }
  }
  return null;
}

export function requireScope(principal: ApiPrincipal, scope: string) {
  return principal.scopes.includes(scope) || principal.scopes.includes("admin");
}

// Bearer-token APIs don't use cookies, but keep the origin configurable rather
// than hard-wiring a wildcard so deployments can lock it down.
const CORS = {
  "Access-Control-Allow-Origin": process.env.API_CORS_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function ok(data: unknown, init?: { status?: number; meta?: unknown }) {
  return NextResponse.json(
    init?.meta !== undefined ? { data, meta: init.meta } : { data },
    { status: init?.status ?? 200, headers: CORS },
  );
}

export function apiError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status, headers: CORS });
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Standard auth guard used by every protected route. */
export async function guard(
  req: Request,
  scope: "read" | "write",
): Promise<{ principal: ApiPrincipal } | { response: NextResponse }> {
  const principal = await authenticateApi(req);
  if (!principal) {
    return {
      response: apiError(401, "Missing or invalid API token. Send 'Authorization: Bearer <token>'."),
    };
  }
  if (!requireScope(principal, scope)) {
    return { response: apiError(403, `This token lacks the '${scope}' scope.`) };
  }
  return { principal };
}

export function paginate(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("per_page") ?? "25", 10) || 25));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

export function pageMeta(page: number, perPage: number, total: number) {
  return { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) };
}
