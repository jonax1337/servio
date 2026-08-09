import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/session";
import { storage } from "@/lib/storage";
import { canViewAttachment } from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Never render these inline, even if somehow stored — force a safe download type.
const UNSAFE_INLINE = /^(text\/html|image\/svg|application\/(xhtml\+xml|xml|javascript|ecmascript))/i;

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const utf8 = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return new Response("Not found", { status: 404 });

  const att = await db.attachment.findUnique({
    where: { id },
    select: { storageKey: true, filename: true, mime: true, size: true, ticketId: true, commentId: true, articleId: true },
  });
  if (!att) return new Response("Not found", { status: 404 });

  // Rehydrate from the DB; a deactivated user is treated as anonymous.
  const dbUser = await getCurrentUser();
  const actor = dbUser && dbUser.isActive ? { id: dbUser.id, role: dbUser.role as Role } : null;
  // 404 (not 403) on deny — no IDOR existence oracle.
  if (!(await canViewAttachment(actor, att))) return new Response("Not found", { status: 404 });

  // Download route serves stored blobs only — never fetches att.url (no SSRF surface).
  if (!att.storageKey) return new Response("Not found", { status: 404 });

  let obj;
  try {
    obj = await storage.get(att.storageKey);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const contentType = UNSAFE_INLINE.test(att.mime) ? "application/octet-stream" : att.mime;

  return new Response(Readable.toWeb(obj.body) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(att.filename),
      "Content-Length": String(att.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
