import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { ticketRef, problemRef, changeRef } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ results: [] });

  const idNum = parseInt(q.replace(/\D/g, ""), 10);
  const byId = Number.isFinite(idNum) ? [{ id: idNum }] : [];

  const [tickets, problems, changes, assets, people, services] = await Promise.all([
    db.ticket.findMany({ where: { OR: [{ title: { contains: q } }, ...byId] }, take: 6, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, prefix: true } }),
    db.problem.findMany({ where: { OR: [{ title: { contains: q } }, ...byId] }, take: 4, select: { id: true, title: true } }),
    db.change.findMany({ where: { OR: [{ title: { contains: q } }, ...byId] }, take: 4, select: { id: true, title: true } }),
    db.asset.findMany({ where: { OR: [{ name: { contains: q } }, { assetTag: { contains: q } }, { serial: { contains: q } }] }, take: 5, select: { id: true, name: true, assetTag: true } }),
    db.user.findMany({ where: { OR: [{ name: { contains: q } }, { email: { contains: q } }] }, take: 5, select: { id: true, name: true, email: true } }),
    db.service.findMany({ where: { name: { contains: q } }, take: 4, select: { id: true, name: true } }),
  ]);

  const results = [
    ...tickets.map((t) => ({ group: "Tickets", kind: "ticket" as const, id: t.id, href: `/tickets/${t.id}`, title: t.title, sub: ticketRef(t.id, t.prefix) })),
    ...problems.map((p) => ({ group: "Problems", kind: "problem" as const, id: p.id, href: `/problems/${p.id}`, title: p.title, sub: problemRef(p.id) })),
    ...changes.map((c) => ({ group: "Changes", kind: "change" as const, id: c.id, href: `/changes/${c.id}`, title: c.title, sub: changeRef(c.id) })),
    ...assets.map((a) => ({ group: "Assets", kind: "asset" as const, id: a.id, href: `/assets/${a.id}`, title: a.name, sub: a.assetTag ?? "Asset" })),
    ...people.map((u) => ({ group: "People", kind: "user" as const, id: u.id, href: `/people/${u.id}`, title: u.name ?? u.email, sub: u.email })),
    ...services.map((s) => ({ group: "Services", kind: "service" as const, id: s.id, href: `/services/${s.id}`, title: s.name, sub: "Service" })),
  ];

  return NextResponse.json({ results });
}
