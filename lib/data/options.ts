import { db } from "@/lib/db";
import { cache } from "react";

/** Option lists used to populate form selects & filters. */
export const getFormOptions = cache(async () => {
  const [agents, groups, categories, services, slas] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER", "AGENT"] }, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.group.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.category.findMany({
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    }),
    db.service.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.sLA.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { agents, groups, categories, services, slas };
});

export type FormOptions = Awaited<ReturnType<typeof getFormOptions>>;
