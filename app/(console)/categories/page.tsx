import type { Metadata } from "next";
import { FolderTree, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { CATEGORY_TYPES } from "@/lib/constants";
import { PageHeader, PageBody } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Categories" };
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<(typeof CATEGORY_TYPES)[number], string> = {
  INCIDENT: "Incident",
  REQUEST: "Service Request",
  PROBLEM: "Problem",
  CHANGE: "Change",
  ASSET: "Asset",
};

type CategoryNode = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  color: string;
  parentId: string | null;
  ticketCount: number;
  children: CategoryNode[];
};

function CategoryRow({ node, depth }: { node: CategoryNode; depth: number }) {
  return (
    <>
      <div
        className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40"
        style={{ marginLeft: depth * 20 }}
      >
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full ring-2 ring-inset ring-black/5"
          style={{ backgroundColor: node.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{node.name}</span>
            {node.ticketCount > 0 ? (
              <span className="rounded-full border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {node.ticketCount} linked
              </span>
            ) : null}
          </div>
          {node.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {node.description}
            </p>
          ) : null}
        </div>
      </div>
      {node.children.map((child) => (
        <CategoryRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default async function CategoriesPage() {
  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { tickets: true } } },
  });

  const nodes: CategoryNode[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    type: c.type,
    color: c.color,
    parentId: c.parentId,
    ticketCount: c._count.tickets,
    children: [],
  }));

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const node of nodes) {
    if (node.parentId) {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
    }
  }

  const hasAny = nodes.length > 0;

  return (
    <>
      <PageHeader
        icon={FolderTree}
        title="Categories"
        description="Classification taxonomy for tickets, problems, changes and assets."
      >
        <LinkButton href="/categories/new">
          <Plus className="size-4" /> New category
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        {!hasAny ? (
          <EmptyState
            icon={FolderTree}
            title="No categories yet"
            description="Create your first category to start organising tickets and other records."
          >
            <LinkButton href="/categories/new" size="sm">
              <Plus className="size-4" /> New category
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {CATEGORY_TYPES.map((type) => {
              const roots = nodes.filter(
                (n) => n.type === type && n.parentId === null,
              );
              const total = nodes.filter((n) => n.type === type).length;
              return (
                <section
                  key={type}
                  className="overflow-hidden rounded-xl border bg-card"
                >
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FolderTree className="size-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold tracking-tight">
                        {TYPE_LABELS[type]}
                      </h2>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {total} {total === 1 ? "category" : "categories"}
                    </span>
                  </div>
                  <div className="p-2">
                    {roots.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                        No {TYPE_LABELS[type].toLowerCase()} categories.
                      </p>
                    ) : (
                      roots.map((node) => (
                        <CategoryRow key={node.id} node={node} depth={0} />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
