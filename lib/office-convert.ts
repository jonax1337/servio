import "server-only";
import { getSetting } from "@/lib/settings";

/**
 * Optional high-fidelity office → PDF conversion via a Gotenberg service
 * (LibreOffice under the hood). Configure `GOTENBERG_URL` (e.g.
 * "http://gotenberg:3000") in Settings → Uploads or env. When unset, callers
 * fall back to the built-in best-effort HTML/text preview (lib/rag/render.ts) —
 * so this is purely additive and never a hard dependency.
 */

/** Office document types worth converting to PDF for a faithful preview — the ones
 *  our pure-JS renderers can't do well (presentations, legacy binaries, ODF docs). */
const PDF_CONVERTIBLE_EXTS = new Set([
  "docx", "doc", "rtf", "odt",
  "pptx", "ppt", "odp",
]);

export function isPdfConvertible(mime: string, ext: string): boolean {
  const e = ext.toLowerCase();
  if (PDF_CONVERTIBLE_EXTS.has(e)) return true;
  const m = mime.toLowerCase();
  return /(msword|ms-powerpoint|presentationml|wordprocessingml|opendocument\.(text|presentation))/.test(m);
}

export async function gotenbergConfigured(): Promise<boolean> {
  return !!(await getSetting("GOTENBERG_URL"));
}

/**
 * Convert an office document buffer to PDF via Gotenberg's LibreOffice route.
 * Returns null when unconfigured or on any failure (caller degrades gracefully).
 */
export async function convertOfficeToPdf(buf: Buffer, filename: string): Promise<Buffer | null> {
  const base = await getSetting("GOTENBERG_URL");
  if (!base) return null;
  const url = base.replace(/\/+$/, "") + "/forms/libreoffice/convert";
  try {
    const form = new FormData();
    // The multipart field name Gotenberg expects is "files"; keep the real name
    // so LibreOffice picks the right import filter from the extension.
    form.append("files", new Blob([new Uint8Array(buf)]), filename);
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return ab.byteLength ? Buffer.from(ab) : null;
  } catch {
    return null;
  }
}
