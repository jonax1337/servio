import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM for settings secrets (SMTP password, AI API keys). The key comes
 * from SETTINGS_ENCRYPTION_KEY (base64 or hex, decoding to exactly 32 bytes).
 * Ciphertext is stored as `base64(iv):base64(tag):base64(ciphertext)`.
 *
 * decryptSecret returns null on ANY failure (missing/rotated key, tampered blob)
 * so callers can fall back to process.env instead of taking mail/AI down.
 *
 * Server-only — never import from a "use client" module.
 */

function loadKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY is not set — required to store or read encrypted settings.",
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must decode to 32 bytes (a base64 or hex 256-bit key).",
    );
  }
  return key;
}

/** True when SETTINGS_ENCRYPTION_KEY is present and valid (32 bytes). Lets
 *  callers fail fast with a friendly message before attempting to store a
 *  secret, instead of throwing mid-write. */
export function encryptionAvailable(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(blob: string): string | null {
  try {
    const key = loadKey();
    const [ivB64, tagB64, dataB64] = blob.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}
