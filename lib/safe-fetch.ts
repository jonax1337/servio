import { lookup } from "node:dns/promises";
import net from "node:net";

// ---------------------------------------------------------------------------
// SSRF guard for outbound webhooks. Admin-configured URLs are still attacker-
// influenced (a compromised manager, or a rule pointed at cloud metadata /
// internal services), so we resolve the host and refuse any private, loopback,
// link-local or reserved address before connecting, and never follow redirects.
// ---------------------------------------------------------------------------

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  if (a === 0) return true; // 0.0.0.0/8 ("this host")
  if (a === 10) return true; // 10/8 (RFC1918)
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 (RFC1918)
  if (a === 192 && b === 168) return true; // 192.168/16 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 (CGNAT)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24 (IETF)
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true; // loopback / unspecified
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateV4(mapped[1]);
  if (s.startsWith("fe80")) return true; // link-local
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) return isPrivateV4(ip);
  if (fam === 6) return isPrivateV6(ip);
  return true; // not a literal IP → treat as unsafe
}

/**
 * Validate an outbound URL: http(s) only, and every resolved address must be a
 * public unicast address. Throws on anything unsafe. Returns the parsed URL.
 */
export async function assertSafePublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const addrs = await lookup(url.hostname, { all: true });
  if (addrs.length === 0) throw new Error("Host did not resolve");
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) throw new Error("URL resolves to a private/reserved address");
  }
  return url;
}

/**
 * SSRF-guarded fetch for webhooks: validates the URL, forbids redirects (so a
 * public host can't 302 to an internal one), and caps the request with a
 * timeout. Never throws for the caller's benefit is NOT assumed — wrap in
 * try/catch if best-effort.
 */
export async function safeWebhookFetch(rawUrl: string, body: unknown, timeoutMs = 5000): Promise<void> {
  await assertSafePublicUrl(rawUrl);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(rawUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error", // a validated host must not bounce us to an internal one
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(to);
  }
}
