import { NextResponse } from "next/server";
import { suggestTriage } from "@/lib/actions/ai";

/**
 * Triage as a route handler (not a server action) so the background analysis runs
 * concurrently and never blocks the agent's server actions (e.g. Save changes),
 * which Next.js serialises per client. Auth is enforced inside suggestTriage.
 */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("ticketId"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ ok: false, error: "Bad ticket" }, { status: 400 });
  }
  const res = await suggestTriage(id);
  return NextResponse.json(res);
}
