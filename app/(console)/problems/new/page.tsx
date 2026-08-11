import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { getFormOptions } from "@/lib/data/options";
import { requireUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProblemForm } from "@/components/problems/problem-form";

export const metadata: Metadata = { title: "New problem" };
export const dynamic = "force-dynamic";

export default async function NewProblemPage() {
  const me = await requireUser();
  const options = await getFormOptions();

  return (
    <>
      <PageHeader
        icon={AlertTriangle}
        title="New problem"
        description="Open a problem record to investigate root cause."
      />
      <PageBody>
        <Card className="mx-auto max-w-3xl">
          <CardContent>
            <ProblemForm options={options} currentUserId={me.id} />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
