import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { resolveCategoryId, resolveAgentId } from "@/lib/ai-tools";
import { createCatalogItem, toggleCatalogPublished, deleteCatalogItem } from "@/lib/actions/catalog-admin";
import { updateServiceField } from "@/lib/actions/services";
import { SERVICE_STATUSES, CRITICALITIES } from "@/lib/constants";
import type { AiOperation } from "../types";
import { ok, err, str, toFormData, coerceEnum } from "../helpers";

/**
 * Services + Service Catalog items. Services are written directly (their create
 * action redirects) with writeAudit; the field update reuses the real
 * updateServiceField action. Catalog items reuse the real catalog-admin actions
 * (which write their own audit + revalidate); the (prev, fd) create/update
 * actions are called as (undefined, fd) and their returned {error?} state is
 * inspected. toggleCatalogPublished TOGGLES, so set_published reads first.
 */

export const OPERATIONS: AiOperation[] = [
  {
    id: "service.create",
    group: "Services",
    kind: "write",
    minRole: "AGENT",
    description:
      "Create a service in the service portfolio. Optionally set status, criticality, a category (by name) and an owner (by name).",
    input: z.object({
      name: z.string().min(2).describe("service name"),
      description: z.string().optional(),
      status: z.enum(SERVICE_STATUSES).optional().describe("service status; default OPERATIONAL"),
      criticality: z.enum(CRITICALITIES).optional().describe("criticality; default MEDIUM"),
      category: z.string().optional().describe("category name"),
      owner: z.string().optional().describe("owner name (an agent, manager or admin)"),
    }),
    label: (a) => `Create service “${String(a.name)}”`,
    run: async (a, ctx) => {
      const name = str(a.name);
      if (!name || name.length < 2) return err("Service name is too short.");

      const status = a.status ? coerceEnum(a.status, SERVICE_STATUSES) : "OPERATIONAL";
      if (!status) return err(`Invalid status. Allowed: ${SERVICE_STATUSES.join(", ")}.`);
      const criticality = a.criticality ? coerceEnum(a.criticality, CRITICALITIES) : "MEDIUM";
      if (!criticality) return err(`Invalid criticality. Allowed: ${CRITICALITIES.join(", ")}.`);

      let categoryId: string | null = null;
      if (str(a.category)) {
        const cat = await resolveCategoryId(String(a.category));
        if (!cat) return err(`Category not found: ${String(a.category)}`);
        categoryId = cat.id;
      }
      let ownerId: string | null = null;
      if (str(a.owner)) {
        const owner = await resolveAgentId(String(a.owner));
        if (!owner) return err(`Owner not found: ${String(a.owner)}`);
        ownerId = owner.id;
      }

      try {
        const row = await db.service.create({
          data: {
            name,
            description: str(a.description) ?? "",
            status,
            criticality,
            ...(categoryId ? { categoryId } : {}),
            ...(ownerId ? { ownerId } : {}),
          },
          select: { id: true },
        });
        await writeAudit({
          userId: ctx.userId,
          action: "CREATE",
          entity: "Service",
          entityId: row.id,
          summary: `Created service "${name}" via Sable`,
        });
        return ok(`Created service "${name}"`);
      } catch (e) {
        if ((e as { code?: string })?.code === "P2002") return err("A service with that name already exists.");
        throw e;
      }
    },
  },
  {
    id: "service.update_field",
    group: "Services",
    kind: "write",
    minRole: "AGENT",
    description:
      "Update a single field on an existing service (found by name). Fields: status, criticality, category (by name), owner (by name).",
    input: z.object({
      service: z.string().describe("the service's name (or part of it)"),
      field: z.enum(["status", "criticality", "category", "owner"]).describe("which field to change"),
      value: z.string().describe("the new value — enum value, or a category/owner name"),
    }),
    label: (a) => `Set ${String(a.field)} of “${String(a.service)}”`,
    run: async (a) => {
      const query = str(a.service);
      if (!query) return err("A service name is required.");
      const svc = await db.service.findFirst({
        where: { name: { contains: query } },
        select: { id: true, name: true },
      });
      if (!svc) return err(`Service not found: ${query}`);

      const field = String(a.field);
      const raw = str(a.value);
      if (!raw) return err("A value is required.");

      let dataField: string;
      let value: string;

      if (field === "status") {
        const v = coerceEnum(raw, SERVICE_STATUSES);
        if (!v) return err(`Invalid status. Allowed: ${SERVICE_STATUSES.join(", ")}.`);
        dataField = "status";
        value = v;
      } else if (field === "criticality") {
        const v = coerceEnum(raw, CRITICALITIES);
        if (!v) return err(`Invalid criticality. Allowed: ${CRITICALITIES.join(", ")}.`);
        dataField = "criticality";
        value = v;
      } else if (field === "category") {
        const cat = await resolveCategoryId(raw);
        if (!cat) return err(`Category not found: ${raw}`);
        dataField = "categoryId";
        value = cat.id;
      } else {
        const owner = await resolveAgentId(raw);
        if (!owner) return err(`Owner not found: ${raw}`);
        dataField = "ownerId";
        value = owner.id;
      }

      await updateServiceField(toFormData({ id: svc.id, field: dataField, value }));
      return ok(`Updated ${field} of service "${svc.name}"`);
    },
  },
  {
    id: "catalog_item.create",
    group: "Service Catalog",
    kind: "write",
    minRole: "MANAGER",
    description:
      "Create a service-catalog item (a request offering). Optionally set a category (by name), publish state, an approval requirement with an approver (by name, must be an agent), and an estimated fulfilment time in days.",
    input: z.object({
      name: z.string().min(2).describe("catalog item name"),
      description: z.string().optional(),
      shortDescription: z.string().optional().describe("a one-line summary"),
      category: z.string().optional().describe("category name"),
      isPublished: z.boolean().optional().describe("whether it is visible in the portal; default true"),
      requiresApproval: z.boolean().optional().describe("whether requests need approval"),
      approver: z.string().optional().describe("approver name (must be an agent or above)"),
      estimatedDays: z.number().optional().describe("estimated fulfilment time in days"),
    }),
    label: (a) => `Create catalog item “${String(a.name)}”`,
    run: async (a) => {
      const name = str(a.name);
      if (!name || name.length < 2) return err("Catalog item name is too short.");

      let categoryId: string | undefined;
      if (str(a.category)) {
        const cat = await resolveCategoryId(String(a.category));
        if (!cat) return err(`Category not found: ${String(a.category)}`);
        categoryId = cat.id;
      }
      let approverId: string | undefined;
      if (str(a.approver)) {
        const approver = await resolveAgentId(String(a.approver));
        if (!approver) return err(`Approver not found: ${String(a.approver)}`);
        approverId = approver.id;
      }

      const isPublished = a.isPublished === undefined ? true : Boolean(a.isPublished);
      const requiresApproval = Boolean(a.requiresApproval);
      const estimatedDays =
        a.estimatedDays === undefined || a.estimatedDays === null ? undefined : Number(a.estimatedDays);

      const state = await createCatalogItem(
        undefined,
        toFormData({
          name,
          description: str(a.description),
          shortDescription: str(a.shortDescription),
          categoryId,
          formSchema: "[]",
          isPublished: isPublished ? "true" : "",
          requiresApproval: requiresApproval ? "true" : "",
          approverId,
          estimatedDays:
            estimatedDays !== undefined && Number.isFinite(estimatedDays) ? String(estimatedDays) : undefined,
        }),
      );
      if (state?.error) return err(state.error);
      return ok(`Created catalog item "${name}"`);
    },
  },
  {
    id: "catalog_item.set_published",
    group: "Service Catalog",
    kind: "write",
    minRole: "MANAGER",
    description:
      "Publish or unpublish a service-catalog item (found by name), controlling whether it appears in the portal.",
    input: z.object({
      name: z.string().describe("catalog item name"),
      published: z.boolean().describe("true to publish, false to unpublish"),
    }),
    label: (a) => `${a.published ? "Publish" : "Unpublish"} catalog item “${String(a.name)}”`,
    run: async (a) => {
      const name = str(a.name);
      if (!name) return err("A catalog item name is required.");
      const item = await db.catalogItem.findFirst({
        where: { name: { contains: name } },
        select: { id: true, name: true, isPublished: true },
      });
      if (!item) return err(`Catalog item not found: ${name}`);

      const target = Boolean(a.published);
      if (item.isPublished === target) {
        return ok(`Catalog item "${item.name}" is already ${target ? "published" : "unpublished"}`);
      }
      await toggleCatalogPublished(toFormData({ id: item.id }));
      return ok(`${target ? "Published" : "Unpublished"} catalog item "${item.name}"`);
    },
  },
  {
    id: "catalog_item.delete",
    group: "Service Catalog",
    kind: "write",
    minRole: "MANAGER",
    description: "Delete a service-catalog item (found by name).",
    input: z.object({ name: z.string().describe("catalog item name to delete") }),
    label: (a) => `Delete catalog item “${String(a.name)}”`,
    run: async (a) => {
      const name = str(a.name);
      if (!name) return err("A catalog item name is required.");
      const item = await db.catalogItem.findFirst({
        where: { name: { contains: name } },
        select: { id: true, name: true },
      });
      if (!item) return err(`Catalog item not found: ${name}`);
      await deleteCatalogItem(toFormData({ id: item.id }));
      return ok(`Deleted catalog item "${item.name}"`);
    },
  },
];
