import type { Metadata } from "next";
import { GitPullRequestArrow } from "lucide-react";
import { getFormOptions } from "@/lib/data/options";
import { requireUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ChangeForm } from "@/components/changes/change-form";

export const metadata: Metadata = { title: "New change" };
export const dynamic = "force-dynamic";

export default async function NewChangePage() {
  const me = await requireUser();
  const options = await getFormOptions();

  return (
    <>
      <PageHeader
        icon={GitPullRequestArrow}
        title="New change"
        description="Raise a change request for review and approval."
      />
      <PageBody>
        <Card className="mx-auto max-w-3xl">
          <CardContent>
            <ChangeForm options={options} currentUserId={me.id} />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
