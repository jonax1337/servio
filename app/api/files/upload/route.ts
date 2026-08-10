import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { validateUpload } from "@/lib/files";
import { buildStorageKey, storage } from "@/lib/storage";
import { canUploadTo, type UploadTarget } from "@/lib/attachments";
import { getNumberSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
  // 1. Session auth, rehydrated from the DB (a deactivated/demoted user must not
  //    keep upload rights on a stale JWT). Never Bearer — files are a browser flow.
  const me = await getCurrentUser();
  if (!me || !me.isActive) return err(401, "Sign in to upload files.");
  const actor = { id: me.id, role: me.role as Role };

  // 2. Must be multipart.
  if (!(req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return err(415, "Expected multipart/form-data.");
  }

  // 2b. Ingress cap BEFORE buffering the body (memory-DoS guard). +1MB slack for
  //     multipart overhead; the real per-file cap is re-checked after parsing.
  //     Cap is admin-configurable (MAX_UPLOAD_MB in Admin Settings) with the env
  //     default; MAX_UPLOAD_BYTES stays the client-side mirror.
  const maxBytes = (await getNumberSetting("MAX_UPLOAD_MB", 15)) * 1024 * 1024;
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes + 1024 * 1024) {
    return err(413, "File is too large.");
  }

  // 3. Parse: a file + exactly one target discriminator.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(422, "Could not parse the upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return err(422, "No file provided.");

  const ticketIdRaw = form.get("ticketId");
  const commentId = form.get("commentId");
  const articleId = form.get("articleId");
  const targets = [ticketIdRaw, commentId, articleId].filter((v) => v != null && v !== "");
  // Zero targets = a STAGING upload: the file is stored owned by the uploader with
  // no parent yet, to be re-parented onto a ticket when the (not-yet-created)
  // request form is submitted. Any authenticated user may stage their own files.
  if (targets.length > 1) return err(422, "Provide at most one target.");

  let target: UploadTarget | null = null;
  if (ticketIdRaw != null && ticketIdRaw !== "") {
    const ticketId = Number(ticketIdRaw);
    if (!Number.isInteger(ticketId)) return err(422, "Invalid ticket id.");
    target = { kind: "ticket", ticketId };
  } else if (commentId != null && commentId !== "") {
    target = { kind: "comment", commentId: String(commentId) };
  } else if (articleId != null && articleId !== "") {
    target = { kind: "article", articleId: String(articleId) };
  }

  // 4. Size pre-check before reading bytes.
  if (file.size > maxBytes) return err(413, "File is too large.");

  // 5. Read bytes.
  const buf = Buffer.from(await file.arrayBuffer());

  // 6. Validate (size again, mime allow-list, ext↔mime, magic bytes). Use the
  //    CANONICAL mime + sanitized name; ignore the client-declared type.
  const v = validateUpload(file.name, file.type, buf, maxBytes);
  if (!v.ok) {
    const map: Record<string, number> = { TOO_LARGE: 413, EMPTY: 422, MIME_NOT_ALLOWED: 415, EXT_MISMATCH: 415, MAGIC_MISMATCH: 415 };
    return err(map[v.code] ?? 400, "This file type is not allowed.");
  }

  // 7. Authorize the write (null → 404, after validation, so no exists-but-forbidden leak).
  //    Staging uploads (no target) are owned by the uploader and carry no FK.
  let fk: { ticketId?: number; commentId?: string; articleId?: string } = {};
  if (target) {
    const resolved = await canUploadTo(actor, target);
    if (!resolved) return err(404, "Not found.");
    fk = resolved;
  }

  // 8. Store the blob (server-generated, unguessable, traversal-free key).
  const key = buildStorageKey(v.safeName);
  let stored;
  try {
    stored = await storage.put(key, buf);
  } catch {
    return err(400, "Could not store the file.");
  }
  const { size, checksum } = stored;

  // 9. Persist the row; roll back the blob on a create failure (FK race).
  let att;
  try {
    att = await db.attachment.create({
      data: { filename: v.safeName, storageKey: key, mime: v.mime, size, checksum, uploadedById: me.id, ...fk },
      select: { id: true, filename: true, mime: true, size: true },
    });
  } catch {
    await storage.delete(key).catch(() => {});
    return err(409, "Could not attach the file.");
  }

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Attachment", entityId: att.id, summary: `Uploaded "${v.safeName}"` });

  // 11. Never expose storageKey/checksum/paths.
  return NextResponse.json(att, { status: 201 });
}
