/**
 * Declarative, per-connector form metadata. PURE data — no server imports — so
 * both the client config form (components/syncs/source-form.tsx) and the server
 * pages/actions can share it. Form field `name` === flat config key, which keeps
 * form <-> config conversion fully generic (see configToFormValues + the action's
 * buildConfig). Adding a connector = add a ConnectorSpec here + a Connector impl.
 */

export type FieldType = "text" | "password" | "number" | "switch" | "select" | "textarea";

export type FieldSpec = {
  name: string;
  label: string;
  type?: FieldType;
  section: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  /** only render when another switch/select field has this value */
  showWhen?: { field: string; equals: string | boolean };
};

export type ConnectorSpec = {
  type: string;
  label: string;
  /** blurb shown under the type picker */
  blurb: string;
  fields: FieldSpec[];
  defaults: Record<string, string | number | boolean>;
  secretFields: string[];
  /** listed in the create form's type picker */
  configurable: boolean;
};

const MAPPING_SECTION = "Field mapping";

/** The six user fields every connector maps onto. `labelSuffix` tweaks the hint. */
function mappingFields(kind: "LDAP attribute" | "CSV column" | "JSON field"): FieldSpec[] {
  const f = (name: string, label: string): FieldSpec => ({
    name,
    label,
    section: MAPPING_SECTION,
    mono: true,
    hint: undefined,
    placeholder: kind,
  });
  return [
    f("externalId", "External ID"),
    f("email", "Email"),
    f("name", "Full name"),
    f("jobTitle", "Job title"),
    f("phone", "Phone"),
    f("department", "Department"),
  ];
}

const deactivateField: FieldSpec = {
  name: "deactivateMissing",
  label: "Deactivate users removed from the source",
  type: "switch",
  section: "Options",
  hint: "Sets isActive=false for users no longer returned (never deletes — ticket history is kept).",
};

const LDAP: ConnectorSpec = {
  type: "LDAP",
  label: "LDAP",
  blurb: "Bind to an LDAP directory and import users.",
  fields: [
    { name: "url", label: "Server URL", section: "Connection", mono: true, placeholder: "ldap://ldap.example.com:389" },
    { name: "bindDN", label: "Bind DN", section: "Connection", mono: true, placeholder: "cn=admin,dc=example,dc=com" },
    { name: "bindPassword", label: "Bind password", type: "password", section: "Connection" },
    { name: "tlsRejectUnauthorized", label: "Verify TLS certificate", type: "switch", section: "Connection" },
    { name: "baseDN", label: "Base DN", section: "Directory", mono: true, placeholder: "ou=people,dc=example,dc=com" },
    { name: "userFilter", label: "User filter", section: "Directory", mono: true },
    {
      name: "scope",
      label: "Search scope",
      type: "select",
      section: "Directory",
      options: [
        { value: "sub", label: "Subtree (all descendants)" },
        { value: "one", label: "One level (direct children)" },
      ],
    },
    { name: "pageSize", label: "Page size", type: "number", section: "Directory", placeholder: "500" },
    ...mappingFields("LDAP attribute"),
    deactivateField,
  ],
  defaults: {
    url: "ldap://ldap.example.com:389",
    bindDN: "cn=admin,dc=example,dc=com",
    tlsRejectUnauthorized: true,
    baseDN: "ou=people,dc=example,dc=com",
    userFilter: "(objectClass=inetOrgPerson)",
    scope: "sub",
    pageSize: 500,
    externalId: "entryUUID",
    email: "mail",
    name: "cn",
    jobTitle: "title",
    phone: "telephoneNumber",
    department: "ou",
    deactivateMissing: false,
  },
  secretFields: ["bindPassword"],
  configurable: true,
};

const ACTIVE_DIRECTORY: ConnectorSpec = {
  ...LDAP,
  type: "ACTIVE_DIRECTORY",
  label: "Active Directory",
  blurb: "Bind to Active Directory (LDAP) and import users.",
  defaults: {
    url: "ldaps://dc01.corp.local:636",
    bindDN: "CN=svc-servio,OU=Service Accounts,DC=corp,DC=local",
    tlsRejectUnauthorized: true,
    baseDN: "DC=corp,DC=local",
    userFilter:
      "(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))",
    scope: "sub",
    pageSize: 500,
    externalId: "objectGUID",
    email: "mail",
    name: "displayName",
    jobTitle: "title",
    phone: "telephoneNumber",
    department: "department",
    deactivateMissing: false,
  },
};

const AZURE_AD: ConnectorSpec = {
  type: "AZURE_AD",
  label: "Azure AD / Entra",
  blurb: "Import users from Microsoft Entra ID via the Graph API (app registration with Users.Read.All).",
  fields: [
    { name: "tenantId", label: "Tenant ID", section: "Connection", mono: true, placeholder: "contoso.onmicrosoft.com or a GUID" },
    { name: "clientId", label: "Client ID", section: "Connection", mono: true },
    { name: "clientSecret", label: "Client secret", type: "password", section: "Connection" },
    {
      name: "filter",
      label: "Graph $filter (optional)",
      section: "Directory",
      mono: true,
      placeholder: "accountEnabled eq true",
      hint: "OData filter applied to /users. Leave blank for all users.",
    },
    deactivateField,
  ],
  defaults: {
    tenantId: "",
    clientId: "",
    filter: "",
    deactivateMissing: false,
  },
  secretFields: ["clientSecret"],
  configurable: true,
};

const CSV: ConnectorSpec = {
  type: "CSV",
  label: "CSV Import",
  blurb: "Import users from a CSV file — fetched from a URL or pasted inline.",
  fields: [
    {
      name: "mode",
      label: "Source",
      type: "select",
      section: "Source",
      options: [
        { value: "url", label: "Fetch from URL" },
        { value: "inline", label: "Paste CSV" },
      ],
    },
    { name: "url", label: "CSV URL", section: "Source", mono: true, placeholder: "https://…/users.csv", showWhen: { field: "mode", equals: "url" } },
    { name: "data", label: "CSV data", type: "textarea", section: "Source", mono: true, showWhen: { field: "mode", equals: "inline" }, placeholder: "id,email,name\n1,a@x.com,Alice" },
    { name: "delimiter", label: "Delimiter", section: "Source", mono: true, placeholder: "," },
    { name: "hasHeader", label: "First row is a header", type: "switch", section: "Source" },
    ...mappingFields("CSV column").map((f) => ({
      ...f,
      hint: "Column header name, or a 0-based index if there is no header row.",
    })),
    deactivateField,
  ],
  defaults: {
    mode: "url",
    url: "",
    data: "",
    delimiter: ",",
    hasHeader: true,
    externalId: "id",
    email: "email",
    name: "name",
    jobTitle: "title",
    phone: "phone",
    department: "department",
    deactivateMissing: false,
  },
  secretFields: [],
  configurable: true,
};

const REST_API: ConnectorSpec = {
  type: "REST_API",
  label: "REST API",
  blurb: "Import users from any JSON HTTP endpoint that returns an array of records.",
  fields: [
    { name: "url", label: "Endpoint URL", section: "Connection", mono: true, placeholder: "https://api.example.com/users" },
    {
      name: "method",
      label: "Method",
      type: "select",
      section: "Connection",
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ],
    },
    { name: "authHeader", label: "Authorization header", type: "password", section: "Connection", placeholder: "Bearer …" },
    { name: "headers", label: "Extra headers (JSON)", type: "textarea", section: "Connection", mono: true, placeholder: '{"X-Api-Key":"…"}' },
    {
      name: "recordsPath",
      label: "Records path",
      section: "Data",
      mono: true,
      placeholder: "data.users",
      hint: "Dot path to the array in the response. Leave blank if the response is already an array.",
    },
    ...mappingFields("JSON field").map((f) => ({
      ...f,
      hint: "Dot path within each record (e.g. profile.email).",
    })),
    deactivateField,
  ],
  defaults: {
    url: "",
    method: "GET",
    authHeader: "",
    headers: "",
    recordsPath: "",
    externalId: "id",
    email: "email",
    name: "name",
    jobTitle: "title",
    phone: "phone",
    department: "department",
    deactivateMissing: false,
  },
  secretFields: ["authHeader"],
  configurable: true,
};

export const CONNECTOR_SPECS: Record<string, ConnectorSpec> = {
  ACTIVE_DIRECTORY,
  LDAP,
  AZURE_AD,
  CSV,
  REST_API,
};

/** Types offered in the create form's picker, in display order. */
export const CONFIGURABLE_TYPES: ConnectorSpec[] = [
  ACTIVE_DIRECTORY,
  LDAP,
  AZURE_AD,
  CSV,
  REST_API,
].filter((s) => s.configurable);

export function getSpec(type: string): ConnectorSpec | null {
  return CONNECTOR_SPECS[type] ?? null;
}

/** Distinct sections for a type, in first-appearance order. */
export function sectionsOf(spec: ConnectorSpec): string[] {
  const out: string[] = [];
  for (const f of spec.fields) if (!out.includes(f.section)) out.push(f.section);
  return out;
}

/**
 * Flatten a stored config into form values for the edit form. Secrets are never
 * exposed; `passwordSet` reports whether one is stored. Missing keys fall back
 * to the type's defaults so partial/old configs degrade gracefully.
 */
export function configToFormValues(
  type: string,
  configRaw: string,
): { values: Record<string, string | number | boolean>; passwordSet: boolean } {
  const spec = getSpec(type);
  if (!spec) return { values: {}, passwordSet: false };
  let obj: Record<string, unknown> = {};
  try {
    obj = (JSON.parse(configRaw || "{}") as Record<string, unknown>) ?? {};
  } catch {
    obj = {};
  }
  const values: Record<string, string | number | boolean> = {};
  for (const f of spec.fields) {
    if (spec.secretFields.includes(f.name)) continue;
    const v = obj[f.name];
    values[f.name] =
      v === undefined || v === null
        ? spec.defaults[f.name] ?? (f.type === "switch" ? false : "")
        : (v as string | number | boolean);
  }
  const passwordSet = spec.secretFields.some(
    (k) => typeof obj[k] === "string" && (obj[k] as string).length > 0,
  );
  return { values, passwordSet };
}
