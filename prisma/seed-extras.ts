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

  // ---- Service request forms + approvals ----
  const approver = (await db.user.findFirst({ where: { role: "MANAGER" } })) ?? (await db.user.findFirst({ where: { role: "ADMIN" } }));
  const hwForm = [
    { key: "device", label: "Which device do you need?", type: "select", required: true, options: ["Standard laptop", "MacBook Pro 14\"", "Standing desk", "Docking station", "External monitor"] },
    { key: "justification", label: "Business justification", type: "textarea", required: true, placeholder: "Why do you need this?" },
    { key: "neededBy", label: "Needed by", type: "date" },
    { key: "accessory", label: "Include accessories bundle", type: "checkbox" },
  ];
  const onboardForm = [
    { key: "name", label: "New employee full name", type: "text", required: true },
    { key: "startDate", label: "Start date", type: "date", required: true },
    { key: "role", label: "Job title", type: "text", required: true },
    { key: "manager", label: "Reporting manager", type: "text", required: true },
    { key: "equipment", label: "Equipment needed", type: "select", options: ["Laptop only", "Laptop + monitor", "Full workstation"] },
  ];
  const accessForm = [
    { key: "system", label: "System / application", type: "select", required: true, options: ["ERP System", "CRM", "Finance shared drive", "VPN", "Admin console"] },
    { key: "level", label: "Access level", type: "select", required: true, options: ["Read only", "Read/Write", "Administrator"] },
    { key: "reason", label: "Reason for access", type: "textarea", required: true },
  ];
  async function setForm(name: string, fields: unknown, approval: boolean) {
    const s = await db.service.findFirst({ where: { name } });
    if (!s) return;
    await db.service.update({ where: { id: s.id }, data: { isRequestable: true, formSchema: JSON.stringify(fields), requiresApproval: approval, approverId: approval ? approver?.id : null } });
  }
  await setForm("Hardware Request", hwForm, true);
  await setForm("New Employee Onboarding", onboardForm, true);
  let acc = await db.service.findFirst({ where: { name: "Access Request" } });
  if (!acc && approver) {
    const cat = await db.category.findFirst({ where: { name: "Access" } });
    acc = await db.service.create({ data: { name: "Access Request", description: "Request access to a system or application.", status: "OPERATIONAL", criticality: "MEDIUM", isPublic: true, categoryId: cat?.id, ownerId: approver.id } });
  }
  await setForm("Access Request", accessForm, true);
  for (const n of ["VPN Access", "Email & Calendar", "Wi-Fi & Network", "File Storage"]) {
    const s = await db.service.findFirst({ where: { name: n } });
    if (s) await db.service.update({ where: { id: s.id }, data: { isRequestable: true } });
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

  console.log("✅ Seed extras: locations, service forms, automations.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
