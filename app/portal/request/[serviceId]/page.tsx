import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseFormSchema } from "@/lib/service-forms";
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
  const s = await db.service.findUnique({ where: { id: serviceId }, select: { name: true } });
  return { title: s ? `Request ${s.name}` : "Request" };
}

export default async function ServiceRequestPage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  await requireUser();
  const { serviceId } = await params;
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service || !service.isPublic) notFound();

  const fields = parseFormSchema(service.formSchema);

  return (
    <div className="mx-auto max-w-2xl">
      <LinkButton href="/portal/services" variant="ghost" size="sm" className="mb-4">
        <ArrowLeft className="size-4" /> Back to catalog
      </LinkButton>

      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <LifeBuoy className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{service.name}</h1>
          <p className="text-sm text-muted-foreground">{service.description}</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ServiceRequestForm
            serviceId={service.id}
            fields={fields}
            requiresApproval={service.requiresApproval}
          />
        </CardContent>
      </Card>
    </div>
  );
}
