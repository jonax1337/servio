"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

export async function runSync(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const sourceId = String(formData.get("sourceId") ?? "");
  if (!sourceId) return;

  const source = await db.syncSource.findUnique({ where: { id: sourceId } });
  if (!source) return;

  const run = await db.syncRun.create({
    data: { sourceId, status: "RUNNING", trigger: "MANUAL" },
  });

  // Simulate a sync run (demo runtime — deterministic randomness is fine here).
  const created = Math.floor(Math.random() * 15);
  const updated = Math.floor(Math.random() * 30);
  const failed = 0;
  const finishedAt = new Date();
  const log = `Synced ${source.name} (${source.type}). ${created} created, ${updated} updated, ${failed} failed.`;

  await db.syncRun.update({
    where: { id: run.id },
    data: { status: "SUCCESS", created, updated, failed, finishedAt, log },
  });

  await db.syncSource.update({
    where: { id: sourceId },
    data: { lastRunAt: finishedAt, lastStatus: "SUCCESS" },
  });

  await writeAudit({
    userId: me.id,
    action: "SYNC",
    entity: "SyncSource",
    entityId: sourceId,
    summary: `Ran sync "${source.name}" — ${created} created, ${updated} updated`,
  });

  revalidatePath("/syncs");
  revalidatePath(`/syncs/${sourceId}`);
}

export async function toggleSyncActive(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const sourceId = String(formData.get("sourceId") ?? "");
  if (!sourceId) return;

  const isActive = formData.get("isActive") === "true";

  const source = await db.syncSource.update({
    where: { id: sourceId },
    data: { isActive },
  });

  await writeAudit({
    userId: me.id,
    action: "SYNC",
    entity: "SyncSource",
    entityId: sourceId,
    summary: `${isActive ? "Activated" : "Paused"} sync "${source.name}"`,
  });

  revalidatePath("/syncs");
  revalidatePath(`/syncs/${sourceId}`);
}
