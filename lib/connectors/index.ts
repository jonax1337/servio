import type { Connector } from "./types";
import { ldapConnector } from "./ldap";

/**
 * Registry of implemented sync connectors, keyed by `SyncSource.type`. Types
 * present in lib/constants.ts (AZURE_AD, INTUNE, CSV, SNOW, REST_API, GLPI) but
 * missing here are not yet implemented — `runSync` reports them as a PARTIAL run
 * rather than failing hard.
 */
export const CONNECTORS: Record<string, Connector> = {
  LDAP: ldapConnector,
  ACTIVE_DIRECTORY: ldapConnector,
};

export function getConnector(type: string): Connector | null {
  return CONNECTORS[type] ?? null;
}

export type { Connector } from "./types";
