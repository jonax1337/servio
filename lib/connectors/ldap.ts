import { Client } from "ldapts";
import { z } from "zod";
import type { Entry } from "ldapts";
import type { SyncSource } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import type { Connector, ConnectorTestResult, SyncResult } from "./types";
import { SyncLog } from "./types";

/**
 * LDAP / Active Directory user import. Binds with a service account, pages
 * through the directory and upserts `User` rows keyed by
 * (syncSourceId, externalId), falling back to email so a directory entry can
 * adopt a user that was created manually. Optionally deactivates users that
 * disappeared from the directory (never deletes — ticket history must survive).
 *
 * The bind password lives inside `SyncSource.config` as an AES-GCM blob
 * (lib/crypto.ts) and is decrypted only here, at run time.
 */

const attrMapSchema = z.object({
  externalId: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
  jobTitle: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  department: z.string().optional().default(""),
});

export const ldapConfigSchema = z.object({
  url: z.string().min(1),
  baseDN: z.string().min(1),
  bindDN: z.string().min(1),
  bindPassword: z.string().optional().default(""),
  userFilter: z.string().min(1),
  scope: z.enum(["sub", "one"]).optional().default("sub"),
  pageSize: z.coerce.number().int().positive().max(5000).optional().default(500),
  tlsRejectUnauthorized: z.coerce.boolean().optional().default(true),
  deactivateMissing: z.coerce.boolean().optional().default(false),
  attr: attrMapSchema,
});

export type LdapConfig = z.infer<typeof ldapConfigSchema>;

/** Per-type field defaults used to prefill the create form. */
export const LDAP_PRESETS: Record<string, LdapConfig> = {
  ACTIVE_DIRECTORY: {
    url: "ldaps://dc01.corp.local:636",
    baseDN: "DC=corp,DC=local",
    bindDN: "CN=svc-servio,OU=Service Accounts,DC=corp,DC=local",
    bindPassword: "",
    userFilter:
      "(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))",
    scope: "sub",
    pageSize: 500,
    tlsRejectUnauthorized: true,
    deactivateMissing: false,
    attr: {
      externalId: "objectGUID",
      email: "mail",
      name: "displayName",
      jobTitle: "title",
      phone: "telephoneNumber",
      department: "department",
    },
  },
  LDAP: {
    url: "ldap://ldap.example.com:389",
    baseDN: "ou=people,dc=example,dc=com",
    bindDN: "cn=admin,dc=example,dc=com",
    bindPassword: "",
    userFilter: "(objectClass=inetOrgPerson)",
    scope: "sub",
    pageSize: 500,
    tlsRejectUnauthorized: true,
    deactivateMissing: false,
    attr: {
      externalId: "entryUUID",
      email: "mail",
      name: "cn",
      jobTitle: "title",
      phone: "telephoneNumber",
      department: "ou",
    },
  },
};

export function ldapPreset(type: string): LdapConfig {
  return LDAP_PRESETS[type] ?? LDAP_PRESETS.LDAP;
}

/** Strip the secret and return plain form values for the create/edit form. */
export function ldapConfigToForm(cfg: LdapConfig) {
  return {
    url: cfg.url,
    baseDN: cfg.baseDN,
    bindDN: cfg.bindDN,
    userFilter: cfg.userFilter,
    scope: cfg.scope,
    pageSize: cfg.pageSize,
    tlsRejectUnauthorized: cfg.tlsRejectUnauthorized,
    deactivateMissing: cfg.deactivateMissing,
    attr: { ...cfg.attr },
  };
}

/**
 * Lenient parse of a stored config for the edit form: merges over the type's
 * preset so missing keys get sensible defaults, and reports whether a bind
 * password is stored (without exposing it).
 */
export function parseConfigForForm(raw: string, type: string) {
  const preset = ldapPreset(type);
  try {
    const obj = (JSON.parse(raw || "{}") ?? {}) as Record<string, unknown>;
    const merged = {
      ...preset,
      ...obj,
      attr: { ...preset.attr, ...((obj.attr as object) ?? {}) },
    };
    const parsed = ldapConfigSchema.safeParse(merged);
    const cfg = parsed.success ? parsed.data : (merged as LdapConfig);
    return {
      values: ldapConfigToForm(cfg),
      passwordSet: typeof obj.bindPassword === "string" && obj.bindPassword.length > 0,
    };
  } catch {
    return { values: ldapConfigToForm(preset), passwordSet: false };
  }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Normalise an LDAP attribute value to a single string (hex for binary). */
function first(value: Entry[string] | undefined): string {
  const v: Buffer | string | undefined = Array.isArray(value) ? value[0] : value;
  if (v == null) return "";
  if (Buffer.isBuffer(v)) return v.toString("hex");
  return String(v);
}

/** Binary attributes (objectGUID/objectSid) must be requested as Buffers. */
function isBinaryAttr(name: string): boolean {
  return /guid|sid/i.test(name);
}

export type MappedUser = {
  externalId: string;
  email: string;
  profile: {
    name: string | null;
    jobTitle?: string | null;
    phone?: string | null;
    department?: string | null;
  };
};

/**
 * Map one directory entry to the fields we import, applying the attribute map.
 * Directory is source of truth: mapped-but-empty attributes clear the field
 * (null); unmapped attributes (blank mapping) are left untouched (undefined,
 * which Prisma ignores on update). Returns an error when a required field
 * (external id / email) is missing. Pure — unit-testable without a server.
 */
export function mapEntry(
  entry: Entry,
  attr: LdapConfig["attr"],
): MappedUser | { error: string } {
  const externalId = first(entry[attr.externalId]);
  const email = first(entry[attr.email]).toLowerCase().trim();
  if (!externalId || !email)
    return { error: `missing ${!externalId ? "external id" : "email"}` };

  const profile: MappedUser["profile"] = {
    name: first(entry[attr.name]).trim() || null,
  };
  if (attr.jobTitle) profile.jobTitle = first(entry[attr.jobTitle]).trim() || null;
  if (attr.phone) profile.phone = first(entry[attr.phone]).trim() || null;
  if (attr.department) profile.department = first(entry[attr.department]).trim() || null;

  return { externalId, email, profile };
}

/** Parse SyncSource.config into a validated LdapConfig with the password decrypted. */
function loadConfig(source: SyncSource): LdapConfig {
  const raw = JSON.parse(source.config || "{}") as unknown;
  const cfg = ldapConfigSchema.parse(raw);
  if (cfg.bindPassword) {
    cfg.bindPassword = decryptSecret(cfg.bindPassword) ?? "";
  }
  return cfg;
}

function makeClient(cfg: LdapConfig): Client {
  return new Client({
    url: cfg.url,
    tlsOptions: { rejectUnauthorized: cfg.tlsRejectUnauthorized },
    timeout: 30_000,
    connectTimeout: 15_000,
  });
}

async function testConnection(source: SyncSource): Promise<ConnectorTestResult> {
  let cfg: LdapConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    return { ok: false, message: `Invalid configuration: ${errMessage(e)}` };
  }
  const client = makeClient(cfg);
  try {
    await client.bind(cfg.bindDN, cfg.bindPassword);
    const { searchEntries } = await client.search(cfg.baseDN, {
      scope: cfg.scope,
      filter: cfg.userFilter,
      sizeLimit: 1,
      paged: false,
      attributes: [cfg.attr.email],
    });
    return {
      ok: true,
      message: `Bound as ${cfg.bindDN}; base DN is searchable (matched ${searchEntries.length} sample entry).`,
    };
  } catch (e) {
    const m = errMessage(e);
    // A size-limit trip still proves bind + search worked.
    if (/size limit/i.test(m)) {
      return { ok: true, message: "Bound and searched successfully (size limit reached — expected)." };
    }
    return { ok: false, message: m };
  } finally {
    try {
      await client.unbind();
    } catch {
      /* ignore */
    }
  }
}

async function run(source: SyncSource): Promise<SyncResult> {
  const log = new SyncLog();

  let cfg: LdapConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    log.line(`Invalid configuration: ${errMessage(e)}`);
    log.failed = 1;
    return { status: "FAILED", created: 0, updated: 0, failed: 1, log: log.toString() };
  }

  const client = makeClient(cfg);
  const seen: string[] = [];

  try {
    await client.bind(cfg.bindDN, cfg.bindPassword);
    log.line(`Bound as ${cfg.bindDN}. Searching ${cfg.baseDN} (${cfg.scope}) …`);

    const attributes = Array.from(
      new Set(
        [
          cfg.attr.externalId,
          cfg.attr.email,
          cfg.attr.name,
          cfg.attr.jobTitle,
          cfg.attr.phone,
          cfg.attr.department,
        ].filter((a): a is string => !!a),
      ),
    );

    const { searchEntries } = await client.search(cfg.baseDN, {
      scope: cfg.scope,
      filter: cfg.userFilter,
      paged: { pageSize: cfg.pageSize },
      attributes,
      explicitBufferAttributes: isBinaryAttr(cfg.attr.externalId)
        ? [cfg.attr.externalId]
        : [],
    });
    log.line(`Directory returned ${searchEntries.length} entries.`);

    for (const entry of searchEntries) {
      const mapped = mapEntry(entry, cfg.attr);
      if ("error" in mapped) {
        log.failed++;
        log.line(`Skipped ${entry.dn}: ${mapped.error}.`);
        continue;
      }
      const { externalId, email, profile } = mapped;
      seen.push(externalId);

      try {
        const existing = await db.user.findFirst({
          where: { OR: [{ syncSourceId: source.id, externalId }, { email }] },
          select: { id: true },
        });
        if (existing) {
          await db.user.update({
            where: { id: existing.id },
            data: { ...profile, email, isActive: true, syncSourceId: source.id, externalId },
          });
          log.updated++;
        } else {
          await db.user.create({
            data: {
              email,
              role: "USER",
              isActive: true,
              syncSourceId: source.id,
              externalId,
              ...profile,
            },
          });
          log.created++;
        }
      } catch (e) {
        log.failed++;
        log.line(`Failed ${email}: ${errMessage(e)}`);
      }
    }

    if (cfg.deactivateMissing) {
      if (seen.length === 0) {
        log.line(
          "Skipped deactivation: the directory returned no users (guarding against mass-deactivation from a misconfiguration).",
        );
      } else {
        const res = await db.user.updateMany({
          where: { syncSourceId: source.id, externalId: { notIn: seen }, isActive: true },
          data: { isActive: false },
        });
        if (res.count)
          log.line(`Deactivated ${res.count} user(s) no longer present in the directory.`);
      }
    }

    log.line(`Done: ${log.created} created, ${log.updated} updated, ${log.failed} failed.`);
  } catch (e) {
    log.line(`Sync error: ${errMessage(e)}`);
    if (log.created === 0 && log.updated === 0) {
      log.failed = Math.max(log.failed, 1);
      return {
        status: "FAILED",
        created: log.created,
        updated: log.updated,
        failed: log.failed,
        log: log.toString(),
      };
    }
  } finally {
    try {
      await client.unbind();
    } catch {
      /* ignore */
    }
  }

  return log.result();
}

export const ldapConnector: Connector = { test: testConnection, run };
