import type { Metadata } from "next";
import { Users } from "lucide-react";
import { getFormOptions } from "@/lib/data/options";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { GroupForm } from "@/components/groups/group-form";

export const metadata: Metadata = { title: "New group" };
export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  await requireRole("MANAGER");
  const options = await getFormOptions();

  return (
    <>
      <PageHeader
        icon={Users}
        title="New group"
        description="Create a team, department or vendor to route and own work."
      />
      <PageBody>
        <Card className="mx-auto max-w-3xl">
          <CardContent className="pt-6">
            <GroupForm options={options} />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
