// Deterministic avatar identity: initials + an individual color derived from a
// user's name (falling back to email). Same name → same color, everywhere.

/** Initials from a display name, or a sensible guess from an email local-part. */
export function initials(nameOrEmail: string | null | undefined): string {
  const s = (nameOrEmail ?? "").trim();
  if (!s) return "?";
  if (s.includes("@")) {
    const local = s.split("@")[0];
    const parts = local.split(/[._+-]+/).filter(Boolean);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2)).toUpperCase();
  }
  const parts = s.split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : s.slice(0, 2)).toUpperCase();
}

/** Stable 32-bit hash of a string (FNV-like, deterministic across runtimes). */
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * A deterministic, legible avatar color for a seed (name/email).
 * Hue spans the wheel; saturation/lightness are fixed so every chip stays
 * readable with white text.
 */
export function avatarColor(seed: string | null | undefined): { backgroundColor: string; color: string } {
  const h = hashString((seed ?? "").trim().toLowerCase() || "?");
  const hue = h % 360;
  // Nudge lightness a touch by a second hash dimension for more variety,
  // but keep it in a band that stays legible against white text.
  const lightness = 42 + (Math.floor(h / 360) % 8); // 42–49%
  return {
    backgroundColor: `hsl(${hue} 62% ${lightness}%)`,
    color: "hsl(0 0% 100%)",
  };
}
