import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { setGroupAutoAssign } from "@/lib/actions/groups";
import { updateUserField } from "@/lib/actions/people";
import { resolveGroupId, resolveAgentId } from "@/lib/ai-tools";
import { GROUP_TYPES, AUTO_ASSIGN_STRATEGIES, ROLES } from "@/lib/constants";
import type { AiOperation } from "../types";
import { ok, err, str, toFormData, coerceEnum } from "../helpers";

/**
 * Organisation: Groups (manager+) and Users (admin-only). Groups follow the
 * reference pattern — guarded Prisma writes + writeAudit — except auto-assign,
 * which reuses the non-redirecting `setGroupAutoAssign` action. User field edits
 * reuse `updateUserField`, then re-read + verify because that action silently
 * no-ops on self-change / last-admin demotion.
 */

export const OPERATIONS: AiOperation[] = [
  {
    id: "group.create",
    group: "Groups",
    kind: "write",
    minRole: "MANAGER",
    description:
      "Create a group (team, department, or vendor). Optionally set a description, email, a manager (by name/email), and an auto-assignment strategy.",
    input: z.object({
      name: z.string().min(2).describe("group name (must be unique)"),
      type: z.enum(GROUP_TYPES).optional().describe("group type; defaults to TEAM"),
      description: z.string().optional(),
      email: z.string().optional().describe("shared/team email"),
      manager: z.string().optional().describe("manager name or email"),
      autoAssign: z
        .enum(AUTO_ASSIGN_STRATEGIES)
        .optional()
        .describe("auto-assignment strategy (OFF, ROUND_ROBIN, LEAST_BUSY)"),
    }),
    label: (a) => `Create group “${str(a.name) ?? ""}”`,
    run: async (a, ctx) => {
      const name = str(a.name);
      if (!name || name.length < 2) return err("Group name is too short.");

      const type = coerceEnum(a.type, GROUP_TYPES) ?? "TEAM";
      const autoAssign = coerceEnum(a.autoAssign, AUTO_ASSIGN_STRATEGIES) ?? "OFF";

      let managerId: string | null = null;
      if (str(a.manager)) {
        const manager = await resolveAgentId(String(a.manager));
        if (!manager) return err(`Manager not found: ${String(a.manager)}`);
        managerId = manager.id;
      }

      const existing = await db.group.findUnique({ where: { name }, select: { id: true } });
      if (existing) return err("A group with that name already exists.");

      const row = await db.group.create({
        data: {
          name,
          type,
          description: str(a.description) ?? null,
          email: str(a.email) ?? null,
          managerId,
          autoAssign,
        },
        select: { id: true },
      });
      await writeAudit({
        userId: ctx.userId,
        action: "CREATE",
        entity: "Group",
        entityId: row.id,
        summary: `Created group "${name}" via Vio`,
      });
      return ok(`Created group "${name}"`);
    },
  },
  {
    id: "group.set_auto_assign",
    group: "Groups",
    kind: "write",
    minRole: "MANAGER",
    description:
      "Change a group's auto-assignment strategy. Identify the group by name. Strategy is one of OFF, ROUND_ROBIN, LEAST_BUSY.",
    input: z.object({
      group: z.string().describe("group name"),
      strategy: z.enum(AUTO_ASSIGN_STRATEGIES).describe("auto-assignment strategy"),
    }),
    label: (a) => `Set auto-assign for “${str(a.group) ?? ""}” to ${str(a.strategy) ?? ""}`,
    run: async (a) => {
      const strategy = coerceEnum(a.strategy, AUTO_ASSIGN_STRATEGIES);
      if (!strategy) return err(`Invalid strategy. Allowed: ${AUTO_ASSIGN_STRATEGIES.join(", ")}.`);

      const group = await resolveGroupId(String(a.group ?? ""));
      if (!group) return err(`Group not found: ${String(a.group ?? "")}`);

      await setGroupAutoAssign(toFormData({ id: group.id, autoAssign: strategy }));
      return ok(`Set auto-assign for "${group.name}" to ${strategy}`);
    },
  },
  {
    id: "user.set_field",
    group: "Users",
    kind: "write",
    minRole: "ADMIN",
    adminOnly: true,
    description:
      "Set a user field. Identify the user by email. Field is one of role (ADMIN, MANAGER, AGENT, USER), isActive (true/false), or isVip (true/false).",
    input: z.object({
      email: z.string().describe("the user's email address"),
      field: z.enum(["role", "isActive", "isVip"]).describe("which field to set"),
      value: z.string().describe("role value (uppercased) or 'true'/'false' for the boolean flags"),
    }),
    label: (a) => `Set ${str(a.field) ?? ""} of ${str(a.email) ?? ""} to ${str(a.value) ?? ""}`,
    run: async (a) => {
      const email = str(a.email);
      if (!email) return err("User email is required.");
      const field = str(a.field);
      if (field !== "role" && field !== "isActive" && field !== "isVip") {
        return err("Invalid field. Allowed: role, isActive, isVip.");
      }

      let value: string;
      if (field === "role") {
        const role = coerceEnum(a.value, ROLES);
        if (!role) return err(`Invalid role. Allowed: ${ROLES.join(", ")}.`);
        value = role;
      } else {
        const v = String(a.value ?? "").trim().toLowerCase();
        if (v !== "true" && v !== "false") return err(`Invalid value for ${field}. Use "true" or "false".`);
        value = v;
      }

      const target = await db.user.findUnique({
        where: { email },
        select: { id: true, name: true, role: true, isActive: true, isVip: true },
      });
      if (!target) return err(`User not found: ${email}`);

      await updateUserField(toFormData({ id: target.id, field, value }));

      // updateUserField silently no-ops on self-change / last-admin demotion — verify.
      const after = await db.user.findUnique({
        where: { id: target.id },
        select: { role: true, isActive: true, isVip: true },
      });
      if (!after) return err("User no longer exists.");

      const changed =
        field === "role"
          ? after.role === value
          : field === "isActive"
            ? after.isActive === (value === "true")
            : after.isVip === (value === "true");
      if (!changed) return err("Change was rejected (e.g. last admin / self-change).");

      const who = target.name ?? email;
      return ok(`Set ${field} of ${who} to ${value}`);
    },
  },
];
