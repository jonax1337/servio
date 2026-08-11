import { z } from "zod";
import type { SyncSource } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import type { Connector, ConnectorTestResult, SyncResult } from "./types";
import { SyncLog } from "./types";
import { importUsers, errMessage, type ImportError, type ImportUser } from "./import";

/**
 * Microsoft Entra ID (Azure AD) user import via the Graph API using the
 * client-credentials flow. Requires an app registration with the application
 * permission Users.Read.All (admin-consented). The client secret lives in
 * SyncSource.config as an AES-GCM blob and is decrypted only at run time.
 *
 * The attribute mapping is fixed to standard Graph fields.
 */

export const azureConfigSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().optional().default(""),
  filter: z.string().optional().default(""),
  deactivateMissing: z.coerce.boolean().optional().default(false),
});

export type AzureConfig = z.infer<typeof azureConfigSchema>;

type GraphUser = {
  id?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
  displayName?: string | null;
  jobTitle?: string | null;
  mobilePhone?: string | null;
  department?: string | null;
};

const GRAPH_SELECT = "id,mail,userPrincipalName,displayName,jobTitle,mobilePhone,department";

function loadConfig(source: SyncSource): AzureConfig {
  const cfg = azureConfigSchema.parse(JSON.parse(source.config || "{}"));
  if (cfg.clientSecret) cfg.clientSecret = decryptSecret(cfg.clientSecret) ?? "";
  return cfg;
}

async function getToken(cfg: AzureConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body },
  );
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token)
    throw new Error(`Token request failed: ${json.error_description || json.error || `HTTP ${res.status}`}`);
  return json.access_token;
}

async function fetchUsers(token: string, filter: string): Promise<GraphUser[]> {
  let url =
    `https://graph.microsoft.com/v1.0/users?$select=${GRAPH_SELECT}&$top=999` +
    (filter ? `&$filter=${encodeURIComponent(filter)}&$count=true` : "");
  const out: GraphUser[] = [];
  // Cap pages defensively so a runaway nextLink can't loop forever.
  for (let page = 0; url && page < 1000; page++) {
    const res: Response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    });
    const json = (await res.json().catch(() => ({}))) as {
      value?: GraphUser[];
      error?: { message?: string };
      "@odata.nextLink"?: string;
    };
    if (!res.ok) throw new Error(`Graph error: ${json.error?.message || `HTTP ${res.status}`}`);
    out.push(...(json.value ?? []));
    url = json["@odata.nextLink"] ?? "";
  }
  return out;
}

function toRecord(u: GraphUser): ImportUser | ImportError {
  const externalId = String(u.id ?? "");
  const email = String(u.mail ?? u.userPrincipalName ?? "")
    .toLowerCase()
    .trim();
  if (!externalId || !email)
    return { error: "missing id or email", ref: u.userPrincipalName ?? u.id ?? "user" };
  return {
    externalId,
    email,
    name: (u.displayName ?? "").trim() || null,
    jobTitle: (u.jobTitle ?? "").trim() || null,
    phone: (u.mobilePhone ?? "").trim() || null,
    department: (u.department ?? "").trim() || null,
  };
}

async function testConnection(source: SyncSource): Promise<ConnectorTestResult> {
  let cfg: AzureConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    return { ok: false, message: `Invalid configuration: ${errMessage(e)}` };
  }
  try {
    const token = await getToken(cfg);
    const res = await fetch(`https://graph.microsoft.com/v1.0/users?$select=id&$top=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Graph error: ${json.error?.message || `HTTP ${res.status}`}`);
    }
    return { ok: true, message: "Acquired a token and reached the Graph /users endpoint." };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

async function run(source: SyncSource): Promise<SyncResult> {
  const log = new SyncLog();
  let cfg: AzureConfig;
  try {
    cfg = loadConfig(source);
  } catch (e) {
    log.line(`Invalid configuration: ${errMessage(e)}`);
    log.failed = 1;
    return { status: "FAILED", created: 0, updated: 0, failed: 1, log: log.toString() };
  }

  let users: GraphUser[];
  try {
    const token = await getToken(cfg);
    users = await fetchUsers(token, cfg.filter);
    log.line(`Graph returned ${users.length} user(s).`);
  } catch (e) {
    log.line(`Graph error: ${errMessage(e)}`);
    log.failed = 1;
    return { status: "FAILED", created: 0, updated: 0, failed: 1, log: log.toString() };
  }

  await importUsers(source, users.map(toRecord), cfg.deactivateMissing, log);
  return log.result();
}

export const azureConnector: Connector = { test: testConnection, run };
