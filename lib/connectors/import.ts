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
