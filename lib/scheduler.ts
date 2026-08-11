import { CronExpressionParser } from "cron-parser";
import { db } from "@/lib/db";
import { getSetting, getBoolSetting, getNumberSetting } from "@/lib/settings";
import { pollImap } from "@/lib/mail-inbound/imap";
import { processInboundMail } from "@/lib/mail-inbound/process";
import { executeSyncRun } from "@/lib/sync-runner";
import type { InboundConfig } from "@/lib/mail-inbound/types";

/**
 * Tiny in-process scheduler. Started once per server instance from
 * instrumentation.ts. Runs two independent ticks: the inbound-mail poll and the
 * cron-driven sync runner (reading SyncSource.schedule).
 *
 * Node-only. Guarded against double-registration under `next dev` HMR via a
 * globalThis flag (same pattern as lib/db.ts / lib/storage.ts).
 */

const g = globalThis as unknown as {
  __servioScheduler?: {
    started: boolean;
    timer?: NodeJS.Timeout;
    syncTimer?: NodeJS.Timeout;
  };
};

let polling = false;
let syncing = false;

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

/**
 * A scheduled source is due when its most recent cron occurrence strictly after
 * `lastRunAt` has already passed. A never-run source (lastRunAt null) is anchored
 * at the epoch, so it fires on the first tick and then advances. Invalid cron
 * expressions never fire.
 */
export function isSyncDue(
  schedule: string,
  lastRunAt: Date | null,
  now: Date,
): boolean {
  try {
    const it = CronExpressionParser.parse(schedule, {
      currentDate: lastRunAt ?? new Date(0),
    });
    return it.next().toDate() <= now;
  } catch {
    return false;
  }
}

async function syncTick(): Promise<void> {
  if (syncing) return; // overlap guard — runs are sequential across sources
  syncing = true;
  try {
    const now = new Date();
    const sources = await db.syncSource.findMany({
      where: { isActive: true, schedule: { not: null } },
    });
    for (const s of sources) {
      if (!s.schedule || !isSyncDue(s.schedule, s.lastRunAt, now)) continue;
      try {
        const res = await executeSyncRun(s, { trigger: "SCHEDULE", actorId: null });
        console.log(
          `[servio:sync] "${s.name}" ${res.status} created=${res.created} updated=${res.updated} failed=${res.failed}`,
        );
      } catch (e) {
        console.error(
          `[servio:sync] "${s.name}" error:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  } catch (e) {
    console.error("[servio:sync] tick error:", e instanceof Error ? e.message : e);
  } finally {
    syncing = false;
  }
}

export async function startScheduler(): Promise<void> {
  if (g.__servioScheduler?.started) return; // HMR / double-register guard

  const seconds = await getNumberSetting("IMAP_POLL_SECONDS", 60);
  const intervalMs = Math.max(15, seconds) * 1000;
  const timer = setInterval(() => void inboundTick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref(); // don't keep the process alive

  // Sync cron granularity is one minute; tick often enough to honour it.
  const syncSeconds = await getNumberSetting("SYNC_TICK_SECONDS", 60);
  const syncIntervalMs = Math.max(30, syncSeconds) * 1000;
  const syncTimer = setInterval(() => void syncTick(), syncIntervalMs);
  if (typeof syncTimer.unref === "function") syncTimer.unref();

  g.__servioScheduler = { started: true, timer, syncTimer };
  console.log(
    `[servio:scheduler] started (inbound poll every ${Math.round(intervalMs / 1000)}s, sync tick every ${Math.round(syncIntervalMs / 1000)}s)`,
  );
  void inboundTick(); // immediate first pass
  void syncTick();
}
