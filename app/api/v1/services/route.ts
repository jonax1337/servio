import { db } from "@/lib/db";
import { guard, ok, preflight } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const auth = await guard(req, "read");
  if ("response" in auth) return auth.response;

  const services = await db.service.findMany({
    orderBy: { name: "asc" },
    include: { sla: true, category: true },
  });

  return ok(
    services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      criticality: s.criticality,
      is_public: s.isPublic,
      category: s.category?.name ?? null,
      sla: s.sla ? { name: s.sla.name, response_mins: s.sla.responseMins, resolve_mins: s.sla.resolveMins } : null,
    })),
  );
}
