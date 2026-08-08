import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseFormSchema } from "@/lib/service-forms";
import { CatalogIcon } from "@/components/catalog/catalog-icon";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceRequestForm } from "@/components/portal/service-request-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}): Promise<Metadata> {
  const { serviceId } = await params;
  const it = await db.catalogItem.findUnique({ where: { id: serviceId }, select: { name: true } });
  return { title: it ? `Request ${it.name}` : "Request" };
}

export default async function CatalogRequestPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  await requireUser();
  const { serviceId } = await params;
  const item = await db.catalogItem.findUnique({ where: { id: serviceId } });
  if (!item || !item.isPublished) notFound();

  const fields = parseFormSchema(item.formSchema);

  return (
    <div className="mx-auto max-w-2xl">
      <LinkButton href="/portal/catalog" variant="ghost" size="sm" className="mb-4">
        <ArrowLeft className="size-4" /> Back to catalog
      </LinkButton>

      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/10">
          <CatalogIcon name={item.icon} className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{item.name}</h1>
          <p className="text-sm text-muted-foreground">{item.description ?? item.shortDescription}</p>
          {item.estimatedDays != null ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3.5" /> Usually delivered in ~{item.estimatedDays} day{item.estimatedDays === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ServiceRequestForm
            serviceId={item.id}
            fields={fields}
            requiresApproval={item.requiresApproval}
          />
        </CardContent>
      </Card>
    </div>
  );
}
