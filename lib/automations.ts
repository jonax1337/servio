import { db } from "@/lib/db";
import { writeAudit, notify } from "@/lib/audit";
import { getAutomationUserId } from "@/lib/system-user";
import { statusChangeData } from "@/lib/sla";
import { TICKET_STATUSES, ticketRef } from "@/lib/constants";
import { parseJson, type Condition, type AutomationAction } from "@/lib/automation-defs";

const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type Trigger =
  | "TICKET_CREATED"
  | "TICKET_UPDATED"
  | "TICKET_SLA_AT_RISK"
  | "TICKET_SLA_BREACHED";

async function loadTicket(id: number) {
  return db.ticket.findUnique({
    where: { id },
    include: { requester: true, group: true, assignee: true },
  });
}
type TicketRow = NonNullable<Awaited<ReturnType<typeof loadTicket>>>;

function fieldValue(t: TicketRow, field: string): string | null {
  if (field === "requesterVip") return t.requester?.isVip ? "true" : "false";
  const v = (t as unknown as Record<string, unknown>)[field];
  return v == null ? null : String(v);
}

function evalCondition(t: TicketRow, c: Condition): boolean {
  const v = fieldValue(t, c.field);
  const target = c.value ?? "";
  switch (c.op) {
    case "eq": return (v ?? "") === target;
    case "ne": return (v ?? "") !== target;
    case "contains": return (v ?? "").toLowerCase().includes(target.toLowerCase());
    case "empty": return !v;
    case "not_empty": return !!v;
    default: return false;
  }
}

/**
 * Run all active automation rules for a trigger against a ticket.
 * Uses direct db writes (never the user-facing actions) so it can't recurse.
 */
export async function runAutomations(trigger: Trigger, ticketId: number) {
  const rules = await db.automationRule.findMany({
    where: { trigger, isActive: true },
    orderBy: { order: "asc" },
  });
  if (rules.length === 0) return;

  let t = await loadTicket(ticketId);
  if (!t) return;

  for (const rule of rules) {
    const conds = parseJson<Condition[]>(rule.conditions, []);
    const match =
      conds.length === 0
        ? true
        : rule.matchType === "ANY"
          ? conds.some((c) => evalCondition(t!, c))
          : conds.every((c) => evalCondition(t!, c));
    if (!match) continue;

    const actions = parseJson<AutomationAction[]>(rule.actions, []);
    const patch: Record<string, unknown> = {};

    for (const a of actions) {
      switch (a.type) {
        case "set_status": {
          // Validate the enum (a corrupt rule must never write a junk status),
          // then apply the SAME SLA/resolution side-effects as the console so
          // automations don't leave the SLA clock or resolution stamps stale.
          const next = a.value;
          if (next && TICKET_STATUSES.includes(next as (typeof TICKET_STATUSES)[number])) {
            patch.status = next;
            Object.assign(patch, statusChangeData(t, next));
          }
          break;
        }
        case "set_priority": patch.priority = a.value; break;
        case "assign": patch.assigneeId = a.value || null; break;
        case "set_group": patch.groupId = a.value || null; break;
        case "escalate": {
          const i = PRIORITY_ORDER.indexOf(t.priority as (typeof PRIORITY_ORDER)[number]);
          patch.priority = PRIORITY_ORDER[Math.min(i + 1, 3)];
          break;
        }
        case "major_incident":
          patch.isMajorIncident = true;
          patch.priority = "CRITICAL";
          break;
        case "notify":
          if (a.value) await notify(a.value, { type: "AUTOMATION", title: `Automation: ${rule.name}`, body: t.title, entity: "Ticket", entityId: String(ticketId) });
          break;
        case "notify_group": {
          // Notify every active agent in the ticket's assigned group.
          if (t.groupId) {
            const members = await db.groupMember.findMany({
              where: { groupId: t.groupId, user: { isActive: true } },
              select: { userId: true },
            });
            for (const m of members) {
              await notify(m.userId, { type: "AUTOMATION", title: `Automation: ${rule.name}`, body: t.title, entity: "Ticket", entityId: String(ticketId) });
            }
          }
          break;
        }
        case "webhook": {
          // Best-effort outbound POST. Never let a bad URL / slow endpoint break
          // the rule run — swallow every error and cap the wait with a timeout.
          if (a.value) {
            try {
              const ctrl = new AbortController();
              const to = setTimeout(() => ctrl.abort(), 5000);
              await fetch(a.value, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  ticketId: t.id,
                  ref: ticketRef(t.id, t.prefix || t.type),
                  title: t.title,
                  status: t.status,
                  priority: t.priority,
                  group: t.group?.name ?? null,
                  assignee: t.assignee?.name ?? null,
                }),
                signal: ctrl.signal,
              }).finally(() => clearTimeout(to));
            } catch {
              /* best-effort — ignore network/timeout errors */
            }
          }
          break;
        }
        case "internal_note": {
          const authorId = await getAutomationUserId();
          await db.ticketComment.create({ data: { ticketId, authorId, isInternal: true, body: a.value || `Automation "${rule.name}" ran.` } });
          break;
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      await db.ticket.update({ where: { id: ticketId }, data: patch });
      t = await loadTicket(ticketId);
      if (!t) return;
    }

    await db.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });
    await writeAudit({ userId: null, action: "AUTOMATION", entity: "Ticket", entityId: ticketId, summary: `Automation "${rule.name}" applied` });
  }
}
