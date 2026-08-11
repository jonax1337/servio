import { getSetting, getBoolSetting, getNumberSetting } from "@/lib/settings";
import { pollImap } from "@/lib/mail-inbound/imap";
import { processInboundMail } from "@/lib/mail-inbound/process";
import type { InboundConfig } from "@/lib/mail-inbound/types";

/**
 * Tiny in-process scheduler. Started once per server instance from
 * instrumentation.ts. Today it runs the inbound-mail poll; the same tick is the
 * hook where the (future) sync runner — reading SyncSource.schedule — will attach.
 *
 * Node-only. Guarded against double-registration under `next dev` HMR via a
 * globalThis flag (same pattern as lib/db.ts / lib/storage.ts).
 */

const g = globalThis as unknown as {
  __servioScheduler?: { started: boolean; timer?: NodeJS.Timeout };
};

let polling = false;

async function readInboundConfig(): Promise<InboundConfig | null> {
  if (!(await getBoolSetting("IMAP_ENABLED", false))) return null;
  const [host, user, pass] = await Promise.all([
    getSetting("IMAP_HOST"),
    getSetting("IMAP_USER"),
    getSetting("IMAP_PASS"),
  ]);
  if (!host || !user || !pass) return null;
  return {
    host,
    port: await getNumberSetting("IMAP_PORT", 993),
    secure: await getBoolSetting("IMAP_SECURE", true),
    user,
    pass,
    folder: (await getSetting("IMAP_FOLDER")) ?? "INBOX",
    tlsRejectUnauthorized: await getBoolSetting("IMAP_TLS_REJECT_UNAUTHORIZED", true),
  };
}

async function inboundTick(): Promise<void> {
  if (polling) return; // overlap guard — never poll on top of a running poll
  const config = await readInboundConfig();
  if (!config) return;
  polling = true;
  try {
    const res = await pollImap(config, async (mail) => {
      await processInboundMail(mail);
    });
    if (res.processed || res.failed) {
      console.log(`[servio:inbound] processed=${res.processed} failed=${res.failed}`);
    }
  } catch (e) {
    console.error("[servio:inbound] poll error:", e instanceof Error ? e.message : e);
  } finally {
    polling = false;
  }
}

export async function startScheduler(): Promise<void> {
  if (g.__servioScheduler?.started) return; // HMR / double-register guard
  const seconds = await getNumberSetting("IMAP_POLL_SECONDS", 60);
  const intervalMs = Math.max(15, seconds) * 1000;
  const timer = setInterval(() => void inboundTick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref(); // don't keep the process alive
  g.__servioScheduler = { started: true, timer };
  console.log(`[servio:scheduler] started (inbound poll every ${Math.round(intervalMs / 1000)}s)`);
  void inboundTick(); // immediate first pass
}
