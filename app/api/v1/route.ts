import { ok, preflight } from "@/lib/api";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

export function GET() {
  return ok({
    name: "Servio API",
    version: "1.0.0",
    documentation: "/api/v1/openapi",
    authentication: "Bearer token — send 'Authorization: Bearer <token>'. Manage tokens under Settings › API Tokens.",
    resources: {
      tickets: "/api/v1/tickets",
      ticket: "/api/v1/tickets/{id}",
      assets: "/api/v1/assets",
      asset: "/api/v1/assets/{id}",
      services: "/api/v1/services",
    },
  });
}
