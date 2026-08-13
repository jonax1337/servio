import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { resolveCategoryId } from "@/lib/ai-tools";
import type { AiOperation } from "../types";
import { ok, err, str } from "../helpers";

/**
 * Categories. Reference module: every domain module follows this shape —
 * export `OPERATIONS: AiOperation[]`, one entry per capability, guarded Prisma
 * writes + writeAudit (the underlying form actions redirect() or use checkbox
 * quirks, so we write directly and mirror their validation).
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

export const OPERATIONS: AiOperation[] = [
  {
    id: "category.create",
    group: "Categories",
    kind: "write",
    minRole: "AGENT",
    description:
      "Create a ticket/service category. Optionally nest it under a parent category (by name) and set a hex colour.",
    input: z.object({
      name: z.string().min(2).describe("category name"),
      parent: z.string().optional().describe("parent category name (for a sub-category)"),
      color: z.string().optional().describe("hex colour like #64748b"),
      description: z.string().optional(),
    }),
    label: (a) => `Create category “${a.name}”`,
    run: async (a, ctx) => {
      const name = str(a.name);
      if (!name || name.length < 2) return err("Category name is too short.");
      const parent = str(a.parent) ? await resolveCategoryId(String(a.parent)) : null;
      if (str(a.parent) && !parent) return err(`Parent category not found: ${a.parent}`);
      const color = str(a.color);
      try {
        const row = await db.category.create({
          data: {
            name,
            parentId: parent?.id ?? null,
            color: color && HEX.test(color) ? color : "#64748b",
            description: str(a.description) ?? null,
          },
          select: { id: true },
        });
        await writeAudit({ userId: ctx.userId, action: "CREATE", entity: "Category", entityId: row.id, summary: `Created category "${name}" via Sable` });
        return ok(`Created category "${name}"`);
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") return err("A category with that name already exists.");
        throw e;
      }
    },
  },
  {
    id: "category.update",
    group: "Categories",
    kind: "write",
    minRole: "AGENT",
    description: "Update an existing category (rename, re-parent, recolour, or change its description). Identify it by its current name.",
    input: z.object({
      current: z.string().describe("the category's current name"),
      name: z.string().optional().describe("new name"),
      parent: z.string().optional().describe("new parent category name; pass 'none' to clear"),
      color: z.string().optional(),
      description: z.string().optional(),
    }),
    label: (a) => `Update category “${a.current}”`,
    run: async (a, ctx) => {
      const target = await resolveCategoryId(String(a.current ?? ""));
      if (!target) return err(`Category not found: ${a.current}`);
      const data: Record<string, unknown> = {};
      if (str(a.name)) data.name = str(a.name);
      if (str(a.description) !== undefined) data.description = str(a.description) ?? null;
      const color = str(a.color);
      if (color && HEX.test(color)) data.color = color;
      const parentRaw = str(a.parent);
      if (parentRaw) {
        if (parentRaw.toLowerCase() === "none") data.parentId = null;
        else {
          const p = await resolveCategoryId(parentRaw);
          if (!p) return err(`Parent category not found: ${a.parent}`);
          if (p.id === target.id) return err("A category cannot be its own parent.");
          data.parentId = p.id;
        }
      }
      if (Object.keys(data).length === 0) return err("Nothing to update.");
      await db.category.update({ where: { id: target.id }, data });
      await writeAudit({ userId: ctx.userId, action: "UPDATE", entity: "Category", entityId: target.id, summary: `Updated category "${target.name}" via Sable` });
      return ok(`Updated category "${target.name}"`);
    },
  },
];
