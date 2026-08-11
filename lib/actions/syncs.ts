"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole, type Role } from "@/lib/session";
import { encryptionAvailable, encryptSecret } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import { getConnector } from "@/lib/connectors";
import { ldapConfigSchema } from "@/lib/connectors/ldap";

export type ActionState = { error?: string; ok?: boolean } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
// base-ui Switch submits "on" when checked, nothing when unchecked.
const checked = (fd: FormData, k: string) => fd.get(k) === "on";

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "ADMIN")) return null;
  return me;
}

/** Types that currently have a real connector implementation. */
const IMPLEMENTED_TYPES = ["LDAP", "ACTIVE_DIRECTORY"] as const;

// --------------------------------------------------------------------------
// Run a sync
// --------------------------------------------------------------------------

export async function runSync(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "AGENT"))
    return { ok: false, message: "Not authorised." };

  const sourceId = str(formData, "sourceId");
  if (!sourceId) return { ok: false, message: "Missing sync source." };

  const source = await db.syncSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, message: "Sync source not found." };

  const connector = getConnector(source.type);

  const run = await db.syncRun.create({
    data: { sourceId, status: "RUNNING", trigger: "MANUAL" },
  });

  // No connector for this type yet — record a PARTIAL run instead of pretending.
  if (!connector) {
    const log = `No connector implemented for type "${source.type}" yet.`;
    const finishedAt = new Date();
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "PARTIAL", created: 0, updated: 0, failed: 0, finishedAt, log },
    });
    await db.syncSource.update({
      where: { id: sourceId },
      data: { lastRunAt: finishedAt, lastStatus: "PARTIAL" },
    });
    revalidatePath("/syncs");
    revalidatePath(`/syncs/${sourceId}`);
    return { ok: false, message: log };
  }

  let result;
  try {
    result = await connector.run(source, { trigger: "MANUAL" });
  } catch (e) {
    result = {
      status: "FAILED" as const,
      created: 0,
      updated: 0,
      failed: 1,
      log: `Unexpected error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const finishedAt = new Date();
  await db.syncRun.update({
    where: { id: run.id },
    data: {
      status: result.status,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
      finishedAt,
      log: result.log,
    },
  });
  await db.syncSource.update({
    where: { id: sourceId },
    data: { lastRunAt: finishedAt, lastStatus: result.status },
  });

  await writeAudit({
    userId: me.id,
    action: "SYNC",
    entity: "SyncSource",
    entityId: sourceId,
    summary: `Ran sync "${source.name}" — ${result.created} created, ${result.updated} updated, ${result.failed} failed (${result.status})`,
  });

  revalidatePath("/syncs");
  revalidatePath(`/syncs/${sourceId}`);

  const summary = `${result.created} created, ${result.updated} updated${result.failed ? `, ${result.failed} failed` : ""}`;
  return {
    ok: result.status !== "FAILED",
    message:
      result.status === "FAILED"
        ? `Sync failed: ${result.log.split("\n").pop() ?? "see run log"}`
        : `Sync ${result.status === "PARTIAL" ? "completed with warnings" : "completed"} — ${summary}.`,
  };
}

export async function toggleSyncActive(formData: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const sourceId = str(formData, "sourceId");
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

// --------------------------------------------------------------------------
// Create / update / delete a sync source
// --------------------------------------------------------------------------

/**
 * Assemble the connector config JSON from the flat form fields. For LDAP the
 * bind password is encrypted at rest; a blank submission keeps the stored one
 * (same "leave blank to keep" convention as the settings forms).
 */
function buildLdapConfig(fd: FormData, prevConfigRaw?: string) {
  let prev: Record<string, unknown> = {};
  try {
    if (prevConfigRaw) prev = JSON.parse(prevConfigRaw) as Record<string, unknown>;
  } catch {
    prev = {};
  }

  const passIn = str(fd, "ldap_bindPassword");
  const bindPassword = passIn
    ? encryptSecret(passIn)
    : typeof prev.bindPassword === "string"
      ? prev.bindPassword
      : "";

  return {
    url: str(fd, "ldap_url"),
    baseDN: str(fd, "ldap_baseDN"),
    bindDN: str(fd, "ldap_bindDN"),
    bindPassword,
    userFilter: str(fd, "ldap_userFilter"),
    scope: str(fd, "ldap_scope") === "one" ? "one" : "sub",
    pageSize: Number(str(fd, "ldap_pageSize")) || 500,
    tlsRejectUnauthorized: checked(fd, "ldap_tlsRejectUnauthorized"),
    deactivateMissing: checked(fd, "ldap_deactivateMissing"),
    attr: {
      externalId: str(fd, "attr_externalId"),
      email: str(fd, "attr_email"),
      name: str(fd, "attr_name"),
      jobTitle: str(fd, "attr_jobTitle"),
      phone: str(fd, "attr_phone"),
      department: str(fd, "attr_department"),
    },
  };
}

/** Validate the assembled config for the given type. Returns an error string or null. */
function validateConfig(type: string, config: unknown): string | null {
  if (type === "LDAP" || type === "ACTIVE_DIRECTORY") {
    const parsed = ldapConfigSchema.safeParse(config);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const path = first?.path.join(".");
      return `Invalid LDAP configuration${path ? ` (${path})` : ""}: ${first?.message ?? "check the fields"}.`;
    }
  }
  return null;
}

export async function createSyncSource(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised." };

  const name = str(fd, "name");
  const type = str(fd, "type");
  if (!name) return { error: "Name is required." };
  if (!(IMPLEMENTED_TYPES as readonly string[]).includes(type))
    return { error: "Unsupported sync type." };

  const password = str(fd, "ldap_bindPassword");
  if (password && !encryptionAvailable())
    return {
      error:
        "Encryption key not configured — set a valid SETTINGS_ENCRYPTION_KEY to store the bind password.",
    };

  const config = buildLdapConfig(fd);
  const invalid = validateConfig(type, config);
  if (invalid) return { error: invalid };

  const schedule = str(fd, "schedule") || null;

  let created;
  try {
    created = await db.syncSource.create({
      data: {
        name,
        type,
        direction: "IMPORT",
        scope: "USERS",
        schedule,
        config: JSON.stringify(config),
        isActive: true,
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002")
      return { error: "A sync source with that name already exists." };
    return { error: "Could not create the sync source. Please try again." };
  }

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "SyncSource",
    entityId: created.id,
    summary: `Created sync source "${name}" (${type})`,
  });

  revalidatePath("/syncs");
  redirect(`/syncs/${created.id}`);
}

export async function updateSyncSource(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised." };

  const id = str(fd, "id");
  if (!id) return { error: "Missing sync source." };
  const existing = await db.syncSource.findUnique({ where: { id } });
  if (!existing) return { error: "Sync source not found." };

  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };

  const password = str(fd, "ldap_bindPassword");
  if (password && !encryptionAvailable())
    return {
      error:
        "Encryption key not configured — set a valid SETTINGS_ENCRYPTION_KEY to store the bind password.",
    };

  const config = buildLdapConfig(fd, existing.config);
  const invalid = validateConfig(existing.type, config);
  if (invalid) return { error: invalid };

  const schedule = str(fd, "schedule") || null;

  try {
    await db.syncSource.update({
      where: { id },
      data: { name, schedule, config: JSON.stringify(config) },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002")
      return { error: "A sync source with that name already exists." };
    return { error: "Could not save the sync source. Please try again." };
  }

  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "SyncSource",
    entityId: id,
    summary: `Updated sync source "${name}"`,
  });

  revalidatePath("/syncs");
  revalidatePath(`/syncs/${id}`);
  redirect(`/syncs/${id}`);
}

export async function deleteSyncSource(fd: FormData) {
  const me = await requireAdmin();
  if (!me) return;
  const id = str(fd, "id");
  if (!id) return;

  const source = await db.syncSource.findUnique({ where: { id } });
  if (!source) return;

  // Detach imported records first (keep the users/assets, drop the link) so the
  // delete never fails on the relation regardless of the DB's FK behaviour.
  await db.user.updateMany({ where: { syncSourceId: id }, data: { syncSourceId: null } });
  await db.asset.updateMany({ where: { syncSourceId: id }, data: { syncSourceId: null } });
  await db.syncSource.delete({ where: { id } });

  await writeAudit({
    userId: me.id,
    action: "DELETE",
    entity: "SyncSource",
    entityId: id,
    summary: `Deleted sync source "${source.name}"`,
  });

  revalidatePath("/syncs");
  redirect("/syncs");
}

/** Test connectivity for a saved source (uses its stored, encrypted credentials). */
export async function testSyncConnection(
  _prev: ActionState & { message?: string },
  fd: FormData,
): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised." };

  const id = str(fd, "id");
  if (!id) return { error: "Save the source before testing the connection." };

  const source = await db.syncSource.findUnique({ where: { id } });
  if (!source) return { error: "Sync source not found." };

  const connector = getConnector(source.type);
  if (!connector) return { error: `No connector implemented for type "${source.type}".` };

  const res = await connector.test(source);
  return res.ok ? { ok: true, message: res.message } : { error: res.message };
}
