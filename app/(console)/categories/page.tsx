import type { Metadata } from "next";
import { FolderTree } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { CreateCategoryDialog } from "@/components/categories/create-category-dialog";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

type Node = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  parentId: string | null;
  team: string | null;
  ticketCount: number;
  children: Node[];
};

function Tree({ nodes, depth = 0 }: { nodes: Node[]; depth?: number }) {
  return (
    <ul className={depth > 0 ? "ml-3 border-l pl-3" : "grid gap-0.5"}>
      {nodes.map((n) => (
        <li key={n.id} className="py-0.5">
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: n.color }} />
            <span className="font-medium">{n.name}</span>
            {n.description ? (
              <span className="truncate text-xs text-muted-foreground">{n.description}</span>
            ) : null}
            {n.team ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{n.team}</span>
            ) : null}
            {n.ticketCount > 0 ? (
              <span className="ml-auto text-xs text-muted-foreground">{n.ticketCount} tickets</span>
            ) : null}
          </div>
          {n.children.length > 0 ? <Tree nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function CategoriesPage() {
  const [categories, teams] = await Promise.all([
    db.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { tickets: true } }, group: { select: { name: true } } },
    }),
    db.group.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const parents = categories.map((c) => ({ id: c.id, name: c.name }));

  const nodes: Node[] = categories.map((c) => ({
    id: c.id, name: c.name, description: c.description, color: c.color,
    parentId: c.parentId, team: c.group?.name ?? null, ticketCount: c._count.tickets, children: [],
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots: Node[] = [];
  for (const n of nodes) {
    if (n.parentId && byId.get(n.parentId)) byId.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }

  return (
    <>
      <PageHeader
        icon={FolderTree}
        title="Categories"
        description="Your classification taxonomy — nest categories to organise tickets, problems, changes and assets."
      >
        <CreateCategoryDialog parents={parents} teams={teams} />
      </PageHeader>

      <PageBody>
        {roots.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            description="Create a top-level category (e.g. Hardware) and nest subcategories under it."
          >
            <CreateCategoryDialog parents={parents} teams={teams} size="sm" />
          </EmptyState>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Tree nodes={roots} />
            </CardContent>
          </Card>
        )}
      </PageBody>
    </>
  );
}
