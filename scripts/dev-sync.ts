/**
 * Dev-only: exercise the sync connectors headless, without the console UI.
 *
 *   pnpm exec tsx --env-file=.env scripts/dev-sync.ts --list
 *   pnpm exec tsx --env-file=.env scripts/dev-sync.ts --test "Corporate AD"
 *   pnpm exec tsx --env-file=.env scripts/dev-sync.ts --run  "Corporate AD"
 *   pnpm exec tsx --env-file=.env scripts/dev-sync.ts --demo            # real run vs. public test LDAP
 *   pnpm exec tsx --env-file=.env scripts/dev-sync.ts --selftest        # offline check of the attribute mapping
 *
 * --demo creates/updates a throwaway source ("Dev LDAP (forumsys)") pointing at
 * the public ldap.forumsys.com server and runs it end-to-end. Needs a valid
 * SETTINGS_ENCRYPTION_KEY (the bind password is stored encrypted, like the UI).
 */
import { db } from "@/lib/db";
import { getConnector } from "@/lib/connectors";
import { mapEntry, ldapPreset } from "@/lib/connectors/ldap";
import { encryptionAvailable, encryptSecret } from "@/lib/crypto";
import type { SyncSource } from "@prisma/client";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function findSource(idOrName: string): Promise<SyncSource | null> {
  return (
    (await db.syncSource.findUnique({ where: { id: idOrName } })) ??
    (await db.syncSource.findUnique({ where: { name: idOrName } }))
  );
}

async function ensureDemoSource(): Promise<SyncSource> {
  if (!encryptionAvailable()) {
    throw new Error("SETTINGS_ENCRYPTION_KEY is not set — required to store the bind password.");
  }
  const config = {
    url: "ldap://ldap.forumsys.com:389",
    baseDN: "dc=example,dc=com",
    bindDN: "cn=read-only-admin,dc=example,dc=com",
    bindPassword: encryptSecret("password"),
    userFilter: "(objectClass=inetOrgPerson)",
    scope: "sub",
    pageSize: 200,
    tlsRejectUnauthorized: true,
    deactivateMissing: false,
    attr: {
      externalId: "uid",
      email: "mail",
      name: "cn",
      jobTitle: "",
      phone: "telephoneNumber",
      department: "",
    },
  };
  const name = "Dev LDAP (forumsys)";
  return db.syncSource.upsert({
    where: { name },
    create: { name, type: "LDAP", direction: "IMPORT", scope: "USERS", config: JSON.stringify(config) },
    update: { config: JSON.stringify(config) },
  });
}

/** Deterministic, offline check of the entry → user mapping. */
function selftest(): void {
  const attr = ldapPreset("ACTIVE_DIRECTORY").attr;
  let pass = 0;
  let fail = 0;
  const check = (name: string, cond: boolean) => {
    if (cond) pass++;
    else {
      fail++;
      console.log(`  ✗ ${name}`);
    }
  };

  // AD entry: binary objectGUID (Buffer) → hex; array-valued mail → first.
  const guid = Buffer.from([0x10, 0x20, 0x30, 0x40]);
  const ad = mapEntry(
    {
      dn: "CN=Alice,DC=corp",
      objectGUID: guid,
      mail: ["alice@corp.local", "alias@corp.local"],
      displayName: "Alice Doe",
      title: "Engineer",
      telephoneNumber: "",
    } as never,
    attr,
  );
  check("AD entry maps", !("error" in ad));
  if (!("error" in ad)) {
    check("objectGUID → hex", ad.externalId === guid.toString("hex"));
    check("array mail → first, lowercased", ad.email === "alice@corp.local");
    check("displayName → name", ad.profile.name === "Alice Doe");
    check("title → jobTitle", ad.profile.jobTitle === "Engineer");
    check("mapped-but-empty phone → null", ad.profile.phone === null);
  }

  // Missing email → error.
  const noMail = mapEntry({ dn: "CN=Bob", objectGUID: "abc" } as never, attr);
  check("missing email → error", "error" in noMail);

  // Missing external id → error.
  const noId = mapEntry({ dn: "CN=Carol", mail: "carol@corp.local" } as never, attr);
  check("missing external id → error", "error" in noId);

  console.log(`selftest: ${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

async function main() {
  if (has("selftest")) {
    selftest();
    return;
  }

  if (has("list")) {
    const sources = await db.syncSource.findMany({ orderBy: { name: "asc" } });
    if (!sources.length) return console.log("(no sync sources)");
    for (const s of sources) {
      console.log(`- ${s.name}  [${s.type}]  ${s.direction}/${s.scope}  active=${s.isActive}  last=${s.lastStatus ?? "never"}  id=${s.id}`);
    }
    return;
  }

  let source: SyncSource | null = null;
  if (has("demo")) source = await ensureDemoSource();
  else {
    const idOrName = arg("test") ?? arg("run");
    if (!idOrName) {
      console.log("Usage: --list | --test <id|name> | --run <id|name> | --demo");
      return;
    }
    source = await findSource(idOrName);
    if (!source) throw new Error(`Sync source not found: ${idOrName}`);
  }

  const connector = getConnector(source.type);
  if (!connector) throw new Error(`No connector for type "${source.type}".`);

  if (has("test")) {
    console.log(`Testing "${source.name}" …`);
    const res = await connector.test(source);
    console.log(res.ok ? `OK — ${res.message}` : `FAILED — ${res.message}`);
    return;
  }

  // --run or --demo → full run
  console.log(`Running "${source.name}" (${source.type}) …`);
  const result = await connector.run(source, { trigger: "MANUAL" });
  console.log("─".repeat(60));
  console.log(result.log);
  console.log("─".repeat(60));
  console.log(`status=${result.status} created=${result.created} updated=${result.updated} failed=${result.failed}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
