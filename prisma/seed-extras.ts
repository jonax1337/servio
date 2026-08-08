import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // ---- Locations (tree) + link assets ----
  await db.location.deleteMany();
  const mk = (name: string, type: string, parentId: string | null, extra: Record<string, unknown> = {}) =>
    db.location.create({ data: { name, type, parentId, ...extra } });
  const hq = await mk("HQ Campus", "SITE", null, { city: "Berlin", country: "DE", address: "Alexanderplatz 1" });
  const bld = await mk("HQ Building A", "BUILDING", hq.id);
  const f3 = await mk("3rd Floor", "FLOOR", bld.id);
  const r301 = await mk("Room 301", "ROOM", f3.id);
  const dcA = await mk("Datacenter A", "DATACENTER", hq.id, { city: "Berlin", country: "DE" });
  const rack1 = await mk("Rack 1", "RACK", dcA.id);
  const rack3 = await mk("Rack 3", "RACK", dcA.id);
  const dcB = await mk("Datacenter B", "DATACENTER", null, { city: "Frankfurt", country: "DE" });
  const locMap: Record<string, string> = {
    "SRV-DC01": rack3.id, "SRV-DC02": rack3.id, "FW-EDGE01": rack1.id, "SW-CORE01": rack1.id,
    "NAS-STORE01": dcB.id, "LT-1042": f3.id, "LT-1088": f3.id, "WS-2201": r301.id,
    "PRN-HQ-3F": f3.id, "MON-4501": r301.id,
  };
  for (const [tag, locId] of Object.entries(locMap)) {
    await db.asset.updateMany({ where: { assetTag: tag }, data: { locationId: locId } });
  }

  // ---- Service Catalog items (separate from operational Services) ----
  await db.catalogItem.deleteMany();
  const approver = (await db.user.findFirst({ where: { role: "MANAGER" } })) ?? (await db.user.findFirst({ where: { role: "ADMIN" } }));
  const catId = async (name: string) => (await db.category.findFirst({ where: { name } }))?.id ?? null;

  const items: Array<{ name: string; short: string; desc: string; cat: string; days: number; approval: boolean; order: number; fields: unknown }> = [
    {
      name: "New laptop", short: "Request a standard or specialised laptop.", desc: "Order a company laptop for a new starter or as a replacement.",
      cat: "Laptop", days: 3, approval: true, order: 0,
      fields: [
        { key: "device", label: "Which device do you need?", type: "select", required: true, options: ["Standard laptop", "MacBook Pro 14\"", "Developer workstation"] },
        { key: "justification", label: "Business justification", type: "textarea", required: true, placeholder: "Why do you need this?" },
        { key: "neededBy", label: "Needed by", type: "date" },
      ],
    },
    {
      name: "New employee onboarding", short: "Set up accounts & equipment for a new hire.", desc: "Kick off IT onboarding for a new team member.",
      cat: "Account", days: 5, approval: true, order: 1,
      fields: [
        { key: "name", label: "New employee full name", type: "text", required: true },
        { key: "startDate", label: "Start date", type: "date", required: true },
        { key: "role", label: "Job title", type: "text", required: true },
        { key: "equipment", label: "Equipment needed", type: "select", options: ["Laptop only", "Laptop + monitor", "Full workstation"] },
      ],
    },
    {
      name: "Access request", short: "Request access to a system or application.", desc: "Ask for access to an internal system with the right permission level.",
      cat: "Permissions", days: 1, approval: true, order: 2,
      fields: [
        { key: "system", label: "System / application", type: "select", required: true, options: ["ERP System", "CRM", "Finance shared drive", "Admin console"] },
        { key: "level", label: "Access level", type: "select", required: true, options: ["Read only", "Read/Write", "Administrator"] },
        { key: "reason", label: "Reason for access", type: "textarea", required: true },
      ],
    },
    {
      name: "VPN access", short: "Get connected to the corporate VPN.", desc: "Request VPN access so you can work securely from anywhere.",
      cat: "VPN", days: 1, approval: false, order: 3, fields: [],
    },
    {
      name: "Software installation", short: "Request software for your device.", desc: "Ask IT to install approved software on your machine.",
      cat: "Software", days: 2, approval: false, order: 4,
      fields: [
        { key: "software", label: "Which software?", type: "text", required: true, placeholder: "e.g. Adobe Creative Cloud" },
        { key: "device", label: "Device name / asset tag", type: "text" },
      ],
    },
    {
      name: "Monitor & peripherals", short: "Order a monitor, dock or accessories.", desc: "Request additional hardware for your desk.",
      cat: "Desktop", days: 3, approval: false, order: 5,
      fields: [
        { key: "item", label: "What do you need?", type: "select", required: true, options: ["External monitor", "Docking station", "Keyboard & mouse", "Headset"] },
      ],
    },
  ];

  for (const it of items) {
    await db.catalogItem.create({
      data: {
        name: it.name, shortDescription: it.short, description: it.desc,
        categoryId: await catId(it.cat), estimatedDays: it.days, order: it.order,
        isPublished: true, requiresApproval: it.approval, approverId: it.approval ? approver?.id : null,
        formSchema: JSON.stringify(it.fields),
      },
    });
  }

  // ---- Automation rules ----
  await db.automationRule.deleteMany();
  const infra = await db.group.findFirst({ where: { name: "Infrastructure" } });
  const sam = await db.user.findFirst({ where: { email: "sam@servio.dev" } });
  if (infra && sam) {
    await db.automationRule.createMany({
      data: [
        { name: "Auto-route VPN incidents to Infrastructure", description: "Any ticket mentioning VPN goes to the Infrastructure team.", trigger: "TICKET_CREATED", matchType: "ALL", order: 0, conditions: JSON.stringify([{ field: "title", op: "contains", value: "vpn" }]), actions: JSON.stringify([{ type: "set_group", value: infra.id }, { type: "internal_note", value: "Auto-routed to Infrastructure (VPN keyword)." }]) },
        { name: "Flag critical tickets", description: "Open and note critical tickets immediately.", trigger: "TICKET_CREATED", matchType: "ALL", order: 1, conditions: JSON.stringify([{ field: "priority", op: "eq", value: "CRITICAL" }]), actions: JSON.stringify([{ type: "set_status", value: "OPEN" }, { type: "notify", value: sam.id }, { type: "internal_note", value: "Critical ticket — flagged for immediate attention." }]) },
        { name: "VIP handling note", description: "Add a note when a VIP raises a ticket.", trigger: "TICKET_CREATED", matchType: "ALL", order: 2, conditions: JSON.stringify([{ field: "requesterVip", op: "eq", value: "true" }]), actions: JSON.stringify([{ type: "internal_note", value: "VIP requester — please prioritise." }]) },
      ],
    });
  }

  console.log("✅ Seed extras: locations, catalog items, automations.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
