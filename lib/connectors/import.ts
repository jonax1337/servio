import type { SyncSource } from "@prisma/client";
import { db } from "@/lib/db";
import { SyncLog } from "./types";

/**
 * The normalised shape every connector maps its source records onto. `undefined`
 * on an optional field means "leave the existing value untouched" (Prisma
 * ignores undefined on update); `null` means "clear it" (the source is
 * authoritative and returned it empty).
 */
export type ImportUser = {
  externalId: string;
  email: string;
  name: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  department?: string | null;
};

/** A record that could not be mapped (missing required field, etc.). */
export type ImportError = { error: string; ref?: string };

export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Upsert a batch of users for a sync source and optionally deactivate the ones
 * that vanished. Shared by every user-import connector. Mutates `log` counters
 * and appends a final summary line.
 */
export async function importUsers(
  source: SyncSource,
  records: (ImportUser | ImportError)[],
  deactivateMissing: boolean,
  log: SyncLog,
): Promise<void> {
  const seen: string[] = [];

  for (const rec of records) {
    if ("error" in rec) {
      log.failed++;
      log.line(`Skipped ${rec.ref ?? "record"}: ${rec.error}.`);
      continue;
    }
    seen.push(rec.externalId);

    const profile = {
      name: rec.name,
      jobTitle: rec.jobTitle,
      phone: rec.phone,
      department: rec.department,
    };

    try {
      const existing = await db.user.findFirst({
        where: {
          OR: [{ syncSourceId: source.id, externalId: rec.externalId }, { email: rec.email }],
        },
        select: { id: true },
      });
      if (existing) {
        await db.user.update({
          where: { id: existing.id },
          data: {
            ...profile,
            email: rec.email,
            isActive: true,
            syncSourceId: source.id,
            externalId: rec.externalId,
          },
        });
        log.updated++;
      } else {
        await db.user.create({
          data: {
            email: rec.email,
            role: "USER",
            isActive: true,
            syncSourceId: source.id,
            externalId: rec.externalId,
            ...profile,
          },
        });
        log.created++;
      }
    } catch (e) {
      log.failed++;
      log.line(`Failed ${rec.email}: ${errMessage(e)}`);
    }
  }

  if (deactivateMissing) {
    if (seen.length === 0) {
      log.line(
        "Skipped deactivation: the source returned no users (guarding against mass-deactivation from a misconfiguration).",
      );
    } else {
      const res = await db.user.updateMany({
        where: { syncSourceId: source.id, externalId: { notIn: seen }, isActive: true },
        data: { isActive: false },
      });
      if (res.count)
        log.line(`Deactivated ${res.count} user(s) no longer present in the source.`);
    }
  }

  log.line(`Done: ${log.created} created, ${log.updated} updated, ${log.failed} failed.`);
}

/**
 * The normalised asset shape connectors map onto. `type`/`status` are never set
 * to null (they are non-null enum columns) — an empty mapping leaves them at the
 * DB default (create) or unchanged (update); other empty-but-mapped fields clear.
 */
export type ImportAsset = {
  externalId: string;
  name: string;
  assetTag?: string | null;
  serial?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  type?: string;
  status?: string;
  ipAddress?: string | null;
  macAddress?: string | null;
  os?: string | null;
  location?: string | null;
};

/**
 * Upsert a batch of assets for a sync source and stamp `lastSeenAt`. Assets that
 * vanished are retired (status=RETIRED) when `deactivateMissing` is on — never
 * deleted. Keyed by (syncSourceId, externalId), falling back to the unique
 * assetTag so a manually-created asset can be adopted.
 */
export async function importAssets(
  source: SyncSource,
  records: (ImportAsset | ImportError)[],
  deactivateMissing: boolean,
  log: SyncLog,
): Promise<void> {
  const seen: string[] = [];
  const now = new Date();

  for (const rec of records) {
    if ("error" in rec) {
      log.failed++;
      log.line(`Skipped ${rec.ref ?? "record"}: ${rec.error}.`);
      continue;
    }
    seen.push(rec.externalId);

    // Only enum columns get special-cased (never null); the rest pass through.
    const data = {
      name: rec.name,
      assetTag: rec.assetTag,
      serial: rec.serial,
      model: rec.model,
      manufacturer: rec.manufacturer,
      ipAddress: rec.ipAddress,
      macAddress: rec.macAddress,
      os: rec.os,
      location: rec.location,
      ...(rec.type ? { type: rec.type } : {}),
      ...(rec.status ? { status: rec.status } : {}),
    };

    try {
      const existing = await db.asset.findFirst({
        where: {
          OR: [
            { syncSourceId: source.id, externalId: rec.externalId },
            ...(rec.assetTag ? [{ assetTag: rec.assetTag }] : []),
          ],
        },
        select: { id: true },
      });
      if (existing) {
        await db.asset.update({
          where: { id: existing.id },
          data: { ...data, syncSourceId: source.id, externalId: rec.externalId, lastSeenAt: now },
        });
        log.updated++;
      } else {
        await db.asset.create({
          data: { ...data, syncSourceId: source.id, externalId: rec.externalId, lastSeenAt: now },
        });
        log.created++;
      }
    } catch (e) {
      log.failed++;
      log.line(`Failed ${rec.name}: ${errMessage(e)}`);
    }
  }

  if (deactivateMissing) {
    if (seen.length === 0) {
      log.line(
        "Skipped retirement: the source returned no assets (guarding against mass-retirement from a misconfiguration).",
      );
    } else {
      const res = await db.asset.updateMany({
        where: {
          syncSourceId: source.id,
          externalId: { notIn: seen },
          status: { not: "RETIRED" },
        },
        data: { status: "RETIRED" },
      });
      if (res.count) log.line(`Retired ${res.count} asset(s) no longer present in the source.`);
    }
  }

  log.line(`Done: ${log.created} created, ${log.updated} updated, ${log.failed} failed.`);
}
