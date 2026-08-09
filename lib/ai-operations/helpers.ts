import type { AiOpResult } from "./types";

export const ok = (summary: string, data?: unknown): AiOpResult => ({ ok: true, summary, data });
export const err = (error: string): AiOpResult => ({ ok: false, error });

/** Validate a value against an enum set (case-insensitive, upper-cased) or return null. */
export function coerceEnum(value: unknown, allowed: readonly string[]): string | null {
  const up = String(value ?? "").trim().toUpperCase();
  return allowed.includes(up) ? up : null;
}

/**
 * Build a FormData from a plain object so we can reuse the app's existing
 * (non-redirecting) FormData server actions from an operation's `run`. Booleans
 * become "on"/"" by default (the checkbox convention most actions use); pass a
 * string ("true"/"false") explicitly when an action reads the literal value.
 * Undefined/null are skipped.
 */
export function toFormData(obj: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    fd.set(k, typeof v === "boolean" ? (v ? "on" : "") : String(v));
  }
  return fd;
}

/** Narrow a possibly-undefined optional string arg to a trimmed string or undefined. */
export function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}
