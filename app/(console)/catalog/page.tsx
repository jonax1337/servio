import type { Metadata } from "next";
import { ShoppingBag, Trash2, ShieldCheck, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ToneBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CatalogEditor } from "@/components/catalog/catalog-editor";
import { CatalogIcon } from "@/components/catalog/catalog-icon";
import { PublishToggle } from "@/components/catalog/publish-toggle";
import { deleteCatalogItem } from "@/lib/actions/catalog-admin";
import { parseFormSchema } from "@/lib/service-forms";

export const metadata: Metadata = { title: "Service Catalog" };
export const dynamic = "force-dynamic";

export default async function CatalogAdminPage() {
  await requireRole("MANAGER");
  const [items, categories, services, agents] = await Promise.all([
    db.catalogItem.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], include: { category: true, _count: { select: { tickets: true } } } }),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.service.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER", "AGENT"] }, isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  const catOpts = categories.map((c) => ({ value: c.id, label: c.name }));
  const serviceOpts = services.map((s) => ({ value: s.id, label: s.name }));
  const agentOpts = agents.map((a) => ({ value: a.id, label: a.name ?? a.email }));

  return (
    <>
      <PageHeader
        icon={ShoppingBag}
        title="Service Catalog"
        description="Items users can request from the self-service portal — separate from operational Services."
      >
        <CatalogEditor categories={catOpts} services={serviceOpts} agents={agentOpts} />
      </PageHeader>

      <PageBody className="grid gap-3">
        {items.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No catalog items yet" description="Add requestable items (laptops, access, onboarding…) with their own request forms.">
            <CatalogEditor categories={catOpts} services={serviceOpts} agents={agentOpts} />
          </EmptyState>
        ) : (
          items.map((it) => (
            <Card key={it.id}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                      <CatalogIcon name={it.icon} className="size-4" />
                    </span>
                    <span className="font-medium">{it.name}</span>
                    {it.category ? <ToneBadge meta={{ label: it.category.name, tone: "indigo" }} icon={false} /> : null}
                    {it.requiresApproval ? <ToneBadge meta={{ label: "Approval", tone: "warning" }} icon={false} /> : null}
                    {!it.isPublished ? <ToneBadge meta={{ label: "Unpublished", tone: "neutral" }} icon={false} /> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{it.shortDescription ?? it.description ?? "—"}</p>
                  <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{parseFormSchema(it.formSchema).length} form fields</span>
                    {it.estimatedDays != null ? <span className="flex items-center gap-1"><Clock className="size-3" /> ~{it.estimatedDays}d</span> : null}
                    {it.requiresApproval ? <span className="flex items-center gap-1"><ShieldCheck className="size-3" /> needs approval</span> : null}
                    <span>{it._count.tickets} requests</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PublishToggle id={it.id} published={it.isPublished} />
                  <CatalogEditor
                    categories={catOpts}
                    services={serviceOpts}
                    agents={agentOpts}
                    item={{
                      id: it.id, name: it.name, description: it.description, shortDescription: it.shortDescription,
                      icon: it.icon, categoryId: it.categoryId, serviceId: it.serviceId, estimatedDays: it.estimatedDays,
                      isPublished: it.isPublished, requiresApproval: it.requiresApproval, approverId: it.approverId,
                      fields: parseFormSchema(it.formSchema),
                    }}
                  />
                  <form action={deleteCatalogItem}>
                    <input type="hidden" name="id" value={it.id} />
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete"><Trash2 className="size-4 text-muted-foreground" /></Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </PageBody>
    </>
  );
}
