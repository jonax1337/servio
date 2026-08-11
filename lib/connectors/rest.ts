import { z } from "zod";
import type { SyncSource } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import type { Connector, ConnectorTestResult, SyncResult } from "./types";
import { SyncLog } from "./types";
import {
  importUsers,
  importAssets,
  errMessage,
  type ImportAsset,
  type ImportError,
  type ImportUser,
} from "./import";

/**
 * Generic REST/JSON user or asset import. Fetches a JSON endpoint, locates the
 * array of records via a dot path, and maps each record's fields (also dot
 * paths) onto a user or asset. Supports pagination by following a next-page URL
 * (dot path), an optional encrypted Authorization header, and extra headers.
 *
 * NetBox: scope=Assets, recordsPath "results", nextPath "next",
 * Authorization "Token <key>".
 */

const mappingKeys = {
  externalId: z.string().optional().default(""),
  email: z.string().optional().default(""),
  name: z.string().optional().default(""),
  jobTitle: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  department: z.string().optional().default(""),
  assetTag: z.string().optional().default(""),
  serial: z.string().optional().default(""),
  model: z.string().optional().default(""),
  manufacturer: z.string().optional().default(""),
  type: z.string().optional().default(""),
  status: z.string().optional().default(""),
  ipAddress: z.string().optional().default(""),
  macAddress: z.string().optional().default(""),
  os: z.string().optional().default(""),
  location: z.string().optional().default(""),
};

export const restConfigSchema = z.object({
  url: z.string().min(1),
  method: z.enum(["GET", "POST"]).optional().default("GET"),
  authHeader: z.string().optional().default(""),
  headers: z.string().optional().default(""),
  recordsPath: z.string().optional().default(""),
  nextPath: z.string().optional().default(""),
  deactivateMissing: z.coerce.boolean().optional().default(false),
  ...mappingKeys,
});

export type RestConfig = z.infer<typeof restConfigSchema>;

/** Read a value from an object by dot path (e.g. "profile.email"). */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function asStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return "";
  return String(v).trim();
}

function loadConfig(source: SyncSource): RestConfig {
  const cfg = restConfigSchema.parse(JSON.parse(source.config || "{}"));
  if (cfg.authHeader) cfg.authHeader = decryptSecret(cfg.authHeader) ?? "";
  return cfg;
}

function buildHeaders(cfg: RestConfig): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (cfg.headers.trim()) {
    const parsed = JSON.parse(cfg.headers) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) headers[k] = String(v);
  }
  if (cfg.authHeader) headers.authorization = cfg.authHeader;
  return headers;
}

async function fetchRecords(cfg: RestConfig): Promise<unknown[]> {
  const headers = buildHeaders(cfg);
  const out: unknown[] = [];
  let url = cfg.url;
  // Cap pages defensively so a bad nextPath can't loop forever.
  for (let page = 0; url && page < 1000; page++) {
    const res = await fetch(url, { method: cfg.method, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} from endpoint`);
    const json = await res.json();
    const arr = getByPath(json, cfg.recordsPath);
    if (!Array.isArray(arr))
      throw new Error(
        cfg.recordsPath
          ? `Path "${cfg.recordsPath}" is not an array`
          : "Response is not a JSON array — set a records path",
      );
    out.push(...arr);
    if (!cfg.nextPath) break;
    const next = getByPath(json, cfg.nextPath);
    url = typeof next === "string" ? next : "";
  }
  return out;
}

function buildUserRecords(cfg: RestConfig, records: unknown[]): (ImportUser | ImportError)[] {
  return records.map((rec, n): ImportUser | ImportError => {
    const externalId = asStr(getByPath(rec, cfg.externalId));
    const email = asStr(getByPath(rec, cfg.email)).toLowerCase();
    if (!externalId || !email)
      return { error: `missing ${!externalId ? "external id" : "email"}`, ref: `record ${n + 1}` };
    const u: ImportUser = { externalId, email, name: asStr(getByPath(rec, cfg.name)) || null };
    if (cfg.jobTitle) u.jobTitle = asStr(getByPath(rec, cfg.jobTitle)) || null;
    if (cfg.phone) u.phone = asStr(getByPath(rec, cfg.phone)) || null;
    if (cfg.department) u.department = asStr(getByPath(rec, cfg.department)) || null;
    return u;
  });
}

function buildAssetRecords(cfg: RestConfig, records: unknown[]): (ImportAsset | ImportError)[] {
  const nullable = (rec: unknown, key: keyof RestConfig): string | null | undefined =>
    cfg[key] ? asStr(getByPath(rec, cfg[key] as string)) || null : undefined;
  const enumish = (rec: unknown, key: keyof RestConfig): string | undefined =>
    cfg[key] ? asStr(getByPath(rec, cfg[key] as string)) || undefined : undefined;

  return records.map((rec, n): ImportAsset | ImportError => {
    const externalId = asStr(getByPath(rec, cfg.externalId));
    const name = asStr(getByPath(rec, cfg.name));
    if (!externalId || !name)
      return { error: `missing ${!externalId ? "external id" : "name"}`, ref: `record ${n + 1}` };
    return {
      externalId,
      name,
      assetTag: nullable(rec, "assetTag"),
      serial: nullable(rec, "serial"),
      model: nullable(rec, "model"),
      manufacturer: nullable(rec, "manufacturer"),
      type: enumish(rec, "type"),
      status: enumish(rec, "status"),
      ipAddress: nullable(rec, "ipAddress"),
      macAddress: nullable(rec, "macAddress"),
      os: nullable(rec, "os"),
      location: nullable(rec, "location"),
    };
  });
}

async function testConnection(source: SyncSource): Promise<ConnectorTestResult> {
  let cfg: RestConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    return { ok: false, message: `Invalid configuration: ${errMessage(e)}` };
  }
  try {
    const records = await fetchRecords(cfg);
    return { ok: true, message: `Fetched ${records.length} record(s) from the endpoint.` };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

async function run(source: SyncSource): Promise<SyncResult> {
  const log = new SyncLog();
  let cfg: RestConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    log.line(`Invalid configuration: ${errMessage(e)}`);
    log.failed = 1;
    return { status: "FAILED", created: 0, updated: 0, failed: 1, log: log.toString() };
  }

  let records: unknown[];
  try {
    records = await fetchRecords(cfg);
    log.line(`Endpoint returned ${records.length} record(s).`);
  } catch (e) {
    log.line(`Fetch error: ${errMessage(e)}`);
    log.failed = 1;
    return { status: "FAILED", created: 0, updated: 0, failed: 1, log: log.toString() };
  }

  if (source.scope === "ASSETS")
    await importAssets(source, buildAssetRecords(cfg, records), cfg.deactivateMissing, log);
  else await importUsers(source, buildUserRecords(cfg, records), cfg.deactivateMissing, log);

  return log.result();
}

export const restConnector: Connector = { test: testConnection, run };
