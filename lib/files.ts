// Pure upload validation — no DB, no fs, no Node-only APIs beyond Buffer.
// Safe to import from route handlers. The server is authoritative; the client
// may pre-check size for UX but never decides what is allowed.

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024;

type Magic = { offset: number; bytes: number[] };
type MimeSpec = { exts: string[]; magic: Magic[] };

// Documents + images only. Office formats are ZIP containers (PK\x03\x04) whose
// magic can't be distinguished from each other, so we trust the extension there.
export const ALLOWED_MIME: Record<string, MimeSpec> = {
  "image/png": { exts: ["png"], magic: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }] },
  "image/jpeg": { exts: ["jpg", "jpeg"], magic: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  "image/gif": { exts: ["gif"], magic: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }] },
  "image/webp": { exts: ["webp"], magic: [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }] }, // + WEBP@8 checked below
  "application/pdf": { exts: ["pdf"], magic: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { exts: ["docx"], magic: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { exts: ["xlsx"], magic: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { exts: ["pptx"], magic: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }] },
  "text/plain": { exts: ["txt", "log"], magic: [] },
  "text/csv": { exts: ["csv"], magic: [] },
};

/** Drop ASCII control chars (< 0x20) and DEL (0x7f) without a control-char regex. */
function stripControl(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0x20 && c !== 0x7f) out += ch;
  }
  return out;
}

/** Make a filename safe: no path separators, control chars, reserved names or traversal. */
export function sanitizeFilename(raw: string): string {
  let name = (raw ?? "").replace(/\\/g, "/");
  name = name.slice(name.lastIndexOf("/") + 1); // basename
  name = stripControl(name.normalize("NFC"));
  // Collapse everything outside the storage-key charset [A-Za-z0-9._-] to "_"
  // (spaces, Unicode letters, punctuation), so the sanitized name is ALWAYS a
  // valid key segment — otherwise storage.put(assertValidKey) would 500 on the
  // majority of real filenames (anything with a space or accent).
  name = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  name = name.replace(/^[._-]+/, ""); // no leading dot/underscore/dash
  name = name.slice(0, 200);
  if (!name || name === "." || name === "..") name = "file";
  return name;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function magicMatches(data: Buffer, spec: MimeSpec, mime: string): boolean {
  if (spec.magic.length === 0) return true; // text/* — no signature to check
  const ok = spec.magic.some((m) => m.bytes.every((b, i) => data[m.offset + i] === b));
  if (!ok) return false;
  // WebP is "RIFF"....(size)...."WEBP" — verify the container tag at offset 8.
  if (mime === "image/webp") {
    return data.length >= 12 && data.toString("ascii", 8, 12) === "WEBP";
  }
  return true;
}

export type ValidationResult =
  | { ok: true; mime: string; safeName: string }
  | { ok: false; code: "TOO_LARGE" | "EMPTY" | "MIME_NOT_ALLOWED" | "EXT_MISMATCH" | "MAGIC_MISMATCH" };

/**
 * Validate an upload against the allow-list. Returns the CANONICAL mime to
 * persist (never the raw client-declared string) and the sanitized filename.
 */
export function validateUpload(filename: string, declaredMime: string, data: Buffer): ValidationResult {
  if (data.length === 0) return { ok: false, code: "EMPTY" };
  if (data.length > MAX_UPLOAD_BYTES) return { ok: false, code: "TOO_LARGE" };

  const safeName = sanitizeFilename(filename);
  const mime = (declaredMime || "").split(";")[0].trim().toLowerCase();
  const spec = ALLOWED_MIME[mime];
  if (!spec) return { ok: false, code: "MIME_NOT_ALLOWED" };
  if (!spec.exts.includes(extOf(safeName))) return { ok: false, code: "EXT_MISMATCH" };
  if (!magicMatches(data, spec, mime)) return { ok: false, code: "MAGIC_MISMATCH" };

  return { ok: true, mime, safeName };
}
