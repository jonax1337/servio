import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { aiConfigured } from "@/lib/ai";
import { runPortalAssistant } from "@/lib/portal-assistant";
import { renderMarkdown } from "@/lib/markdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Turn = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  // Respect the same on/off gate as the rest of Vio. When AI is not configured
  // the client shows a friendly "ask your admin" note instead of calling again.
  if (!(await aiConfigured())) {
    return NextResponse.json({ configured: false });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "messages required" }, { status: 400 });

  const messages: Turn[] = raw
    .filter(
      (m): m is Turn =>
        !!m &&
        typeof (m as Turn).content === "string" &&
        ((m as Turn).role === "user" || (m as Turn).role === "assistant"),
    )
    .map((m) => ({ role: m.role, content: m.content }));

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "expected a user message" }, { status: 400 });
  }

  try {
    const { text, proposal } = await runPortalAssistant(messages);
    const answer = text || "I'm not sure about that one. Would you like to open a request so a person can help?";
    return NextResponse.json({
      configured: true,
      html: renderMarkdown(answer, "markdown"),
      text: answer,
      proposal,
    });
  } catch (err) {
    console.error("[portal-assistant]", err);
    return NextResponse.json(
      { error: "Vio ran into a problem answering that. Please try again, or open a request." },
      { status: 500 },
    );
  }
}
