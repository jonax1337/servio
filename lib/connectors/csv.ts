import { z } from "zod";
import type { SyncSource } from "@prisma/client";
import type { Connector, ConnectorTestResult, SyncResult } from "./types";
import { SyncLog } from "./types";
import { importUsers, errMessage, type ImportError, type ImportUser } from "./import";

/**
 * CSV user import. The CSV is either fetched from a URL or pasted inline into the
 * source config. Columns are mapped by header name (when the first row is a
 * header) or by 0-based index. No external service — great for a quick import or
 * for validating the connector pipeline without infrastructure.
 */

export const csvConfigSchema = z
  .object({
    mode: z.enum(["url", "inline"]).optional().default("url"),
    url: z.string().optional().default(""),
    data: z.string().optional().default(""),
    delimiter: z.string().optional().default(","),
    hasHeader: z.coerce.boolean().optional().default(true),
    deactivateMissing: z.coerce.boolean().optional().default(false),
    externalId: z.string().min(1),
    email: z.string().min(1),
    name: z.string().optional().default(""),
    jobTitle: z.string().optional().default(""),
    phone: z.string().optional().default(""),
    department: z.string().optional().default(""),
  })
  .refine((c) => (c.mode === "url" ? c.url.trim().length > 0 : c.data.trim().length > 0), {
    message: "a URL (mode=url) or inline data (mode=inline) is required",
    path: ["url"],
  });

export type CsvConfig = z.infer<typeof csvConfigSchema>;

/** Minimal RFC 4180 parser: quoted fields, escaped "" quotes, CRLF/LF rows. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const d = (delimiter || ",").charAt(0);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawField = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawField = true;
    } else if (c === d) {
      row.push(field);
      field = "";
      sawField = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (sawField || field.length) {
        row.push(field);
        rows.push(row);
      }
      row = [];
      field = "";
      sawField = false;
    } else {
      field += c;
      sawField = true;
    }
  }
  if (sawField || field.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function columnIndex(mapVal: string, headers: string[] | null): number {
  const v = mapVal.trim();
  if (!v) return -1;
  if (headers) return headers.findIndex((h) => h.trim().toLowerCase() === v.toLowerCase());
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

async function loadRows(cfg: CsvConfig): Promise<string[][]> {
  let text: string;
  if (cfg.mode === "url") {
    const res = await fetch(cfg.url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching CSV`);
    text = await res.text();
  } else {
    text = cfg.data;
  }
  return parseCsv(text, cfg.delimiter);
}

function buildRecords(cfg: CsvConfig, rows: string[][]): (ImportUser | ImportError)[] {
  const headers = cfg.hasHeader ? rows[0]?.map((h) => h) ?? [] : null;
  const dataRows = cfg.hasHeader ? rows.slice(1) : rows;

  const idx = {
    externalId: columnIndex(cfg.externalId, headers),
    email: columnIndex(cfg.email, headers),
    name: columnIndex(cfg.name, headers),
    jobTitle: columnIndex(cfg.jobTitle, headers),
    phone: columnIndex(cfg.phone, headers),
    department: columnIndex(cfg.department, headers),
  };
  const cell = (row: string[], i: number) => (i >= 0 && i < row.length ? String(row[i]).trim() : "");

  return dataRows.map((row, n): ImportUser | ImportError => {
    const externalId = cell(row, idx.externalId);
    const email = cell(row, idx.email).toLowerCase();
    if (!externalId || !email)
      return { error: `missing ${!externalId ? "external id" : "email"}`, ref: `row ${n + 1}` };
    const u: ImportUser = { externalId, email, name: cell(row, idx.name) || null };
    if (cfg.jobTitle) u.jobTitle = idx.jobTitle >= 0 ? cell(row, idx.jobTitle) || null : undefined;
    if (cfg.phone) u.phone = idx.phone >= 0 ? cell(row, idx.phone) || null : undefined;
    if (cfg.department) u.department = idx.department >= 0 ? cell(row, idx.department) || null : undefined;
    return u;
  });
}

function loadConfig(source: SyncSource): CsvConfig {
  return csvConfigSchema.parse(JSON.parse(source.config || "{}"));
}

async function testConnection(source: SyncSource): Promise<ConnectorTestResult> {
  let cfg: CsvConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    return { ok: false, message: `Invalid configuration: ${errMessage(e)}` };
  }
  try {
    const rows = await loadRows(cfg);
    const dataCount = cfg.hasHeader ? Math.max(0, rows.length - 1) : rows.length;
    const headers = cfg.hasHeader ? (rows[0] ?? []).join(", ") : "(no header)";
    return { ok: true, message: `Parsed ${dataCount} data row(s). Columns: ${headers}.` };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

async function run(source: SyncSource): Promise<SyncResult> {
  const log = new SyncLog();
  let cfg: CsvConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    log.line(`Invalid configuration: ${errMessage(e)}`);
    log.failed = 1;
    return { status: "FAILED", created: 0, updated: 0, failed: 1, log: log.toString() };
  }

  let rows: string[][];
  try {
    rows = await loadRows(cfg);
    log.line(`Loaded ${rows.length} row(s) from ${cfg.mode === "url" ? cfg.url : "inline data"}.`);
  } catch (e) {
    log.line(`Load error: ${errMessage(e)}`);
    log.failed = 1;
    return { status: "FAILED", created: 0, updated: 0, failed: 1, log: log.toString() };
  }

  await importUsers(source, buildRecords(cfg, rows), cfg.deactivateMissing, log);
  return log.result();
}

export const csvConnector: Connector = { test: testConnection, run };
