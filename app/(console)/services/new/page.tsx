import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { getFormOptions } from "@/lib/data/options";
import { requireUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ServiceForm } from "@/components/services/service-form";

export const metadata: Metadata = { title: "New service" };
export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  await requireUser();
  const options = await getFormOptions();

  return (
    <>
      <PageHeader
        icon={LifeBuoy}
        title="New service"
        description="Add a business or IT service to the catalog."
      />
      <PageBody>
        <Card className="mx-auto max-w-3xl">
          <CardContent className="pt-6">
            <ServiceForm options={options} />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
