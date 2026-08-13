"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasRole, type Role } from "@/lib/session";
import { setSetting } from "@/lib/settings";
import { encryptionAvailable } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";

export type ActionState = { error?: string; ok?: boolean } | undefined;

type Entry = {
  key: string;
  value: string;
  encrypted?: boolean;
  /** Secret fields: a blank submission keeps the stored value (don't wipe it). */
  keepIfEmpty?: boolean;
};

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "ADMIN")) return null;
  return me;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
// base-ui Switch submits "on" when checked, nothing when unchecked.
const bool = (fd: FormData, k: string) => (fd.get(k) === "on" ? "true" : "false");

async function persist(
  userId: string,
  entries: Entry[],
  summary: string,
  path: string,
): Promise<ActionState> {
  // Fail fast, before any write, if a secret will be stored but the encryption
  // key is missing/invalid — otherwise encryptSecret throws mid-loop and leaves
  // the table partially updated with no audit trail.
  const willWriteSecret = entries.some(
    (e) => e.encrypted && e.value !== "" && !(e.keepIfEmpty && e.value === ""),
  );
  if (willWriteSecret && !encryptionAvailable()) {
    return {
      error:
        "Encryption key not configured — set a valid SETTINGS_ENCRYPTION_KEY to store secrets.",
    };
  }

  try {
    for (const e of entries) {
      if (e.keepIfEmpty && e.value === "") continue;
      await setSetting(e.key, e.value, { encrypted: e.encrypted, userId });
    }
  } catch {
    return { error: "Could not save settings. Please try again." };
  }

  await writeAudit({
    userId,
    action: "UPDATE",
    entity: "AppSetting",
    entityId: path,
    summary,
  });
  revalidatePath(path);
  return { ok: true };
}

export async function saveGeneralSettings(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised" };
  return persist(
    me.id,
    [
      { key: "APP_NAME", value: str(fd, "APP_NAME") },
      { key: "APP_URL", value: str(fd, "APP_URL") },
    ],
    "Updated general settings",
    "/settings/general",
  );
}

export async function saveEmailSettings(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised" };
  return persist(
    me.id,
    [
      { key: "SMTP_HOST", value: str(fd, "SMTP_HOST") },
      { key: "SMTP_PORT", value: str(fd, "SMTP_PORT") },
      { key: "SMTP_SECURE", value: bool(fd, "SMTP_SECURE") },
      { key: "SMTP_USER", value: str(fd, "SMTP_USER") },
      { key: "SMTP_PASS", value: str(fd, "SMTP_PASS"), encrypted: true, keepIfEmpty: true },
      { key: "SMTP_FROM", value: str(fd, "SMTP_FROM") },
    ],
    "Updated email settings",
    "/settings/email",
  );
}

export async function saveInboundSettings(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised" };
  return persist(
    me.id,
    [
      { key: "IMAP_ENABLED", value: bool(fd, "IMAP_ENABLED") },
      { key: "IMAP_HOST", value: str(fd, "IMAP_HOST") },
      { key: "IMAP_PORT", value: str(fd, "IMAP_PORT") },
      { key: "IMAP_SECURE", value: bool(fd, "IMAP_SECURE") },
      { key: "IMAP_USER", value: str(fd, "IMAP_USER") },
      { key: "IMAP_PASS", value: str(fd, "IMAP_PASS"), encrypted: true, keepIfEmpty: true },
      { key: "IMAP_FOLDER", value: str(fd, "IMAP_FOLDER") },
      { key: "IMAP_POLL_SECONDS", value: str(fd, "IMAP_POLL_SECONDS") },
      { key: "MAIL_PLUS_ADDRESSING", value: bool(fd, "MAIL_PLUS_ADDRESSING") },
    ],
    "Updated inbound mail settings",
    "/settings/inbound",
  );
}

export async function saveAiSettings(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised" };
  return persist(
    me.id,
    [
      { key: "AI_PROVIDER", value: str(fd, "AI_PROVIDER") },
      { key: "AI_ALLOW_EXTERNAL", value: bool(fd, "AI_ALLOW_EXTERNAL") },
      { key: "AI_MODEL", value: str(fd, "AI_MODEL") },
      { key: "OLLAMA_BASE_URL", value: str(fd, "OLLAMA_BASE_URL") },
      { key: "OLLAMA_MODEL", value: str(fd, "OLLAMA_MODEL") },
      { key: "AI_MAX_OUTPUT_TOKENS", value: str(fd, "AI_MAX_OUTPUT_TOKENS") },
      { key: "AI_TEASER", value: bool(fd, "AI_TEASER") },
      { key: "AI_TICKET_TRIAGE", value: bool(fd, "AI_TICKET_TRIAGE") },
      { key: "ANTHROPIC_API_KEY", value: str(fd, "ANTHROPIC_API_KEY"), encrypted: true, keepIfEmpty: true },
      { key: "OPENAI_API_KEY", value: str(fd, "OPENAI_API_KEY"), encrypted: true, keepIfEmpty: true },
    ],
    "Updated AI settings",
    "/settings/ai",
  );
}

export async function saveUploadSettings(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised" };
  return persist(
    me.id,
    [{ key: "MAX_UPLOAD_MB", value: str(fd, "MAX_UPLOAD_MB") }],
    "Updated upload settings",
    "/settings/uploads",
  );
}
