import type { ZodTypeAny } from "zod";
import type { Connector } from "./types";
import { ldapConnector, ldapConfigSchema } from "./ldap";
import { csvConnector, csvConfigSchema } from "./csv";
import { azureConnector, azureConfigSchema } from "./azure";
import { restConnector, restConfigSchema } from "./rest";

/**
 * Registry of implemented sync connectors, keyed by `SyncSource.type`. Types
 * present in lib/constants.ts but missing here (INTUNE, SNOW, GLPI) are not yet
 * implemented — `runSync` reports them as a PARTIAL run rather than failing hard.
 */
export const CONNECTORS: Record<string, Connector> = {
  LDAP: ldapConnector,
  ACTIVE_DIRECTORY: ldapConnector,
  AZURE_AD: azureConnector,
  CSV: csvConnector,
  REST_API: restConnector,
};

export function getConnector(type: string): Connector | null {
  return CONNECTORS[type] ?? null;
}

/** zod schema for a type's config, used for create/edit validation. */
const CONFIG_SCHEMAS: Record<string, ZodTypeAny> = {
  LDAP: ldapConfigSchema,
  ACTIVE_DIRECTORY: ldapConfigSchema,
  AZURE_AD: azureConfigSchema,
  CSV: csvConfigSchema,
  REST_API: restConfigSchema,
};

export function getConfigSchema(type: string): ZodTypeAny | null {
  return CONFIG_SCHEMAS[type] ?? null;
}

export type { Connector } from "./types";
