import type { Metadata } from "next";
import { ShieldAlert, LayoutDashboard } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { requiredRoleFor } from "@/lib/route-guard";
import type { SearchParams } from "@/lib/query";
import { getParam } from "@/lib/query";

export const metadata: Metadata = { title: "No access" };
export const dynamic = "force-dynamic";

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Re-check against the live DB user (role/isActive), never the stale JWT.
  const user = await requireUser();
  const sp = await searchParams;
  const from = getParam(sp, "from");
  const required = from ? requiredRoleFor(from) : null;

  return (
    <>
      <PageHeader
        icon={ShieldAlert}
        title="Access restricted"
        description="You don't have permission to view this area."
      />

      <PageBody>
        <EmptyState
          icon={ShieldAlert}
          title="You can't access this area"
          description={
            required
              ? `This area is limited to ${required} and above. Your current role is ${user.role}. Ask an administrator if you need access.`
              : `Your current role (${user.role}) doesn't have permission to view this area. Ask an administrator if you need access.`
          }
        >
          {from ? (
            <p className="rounded-md border bg-muted/50 px-2.5 py-1 font-mono text-xs text-muted-foreground">
              {from}
            </p>
          ) : null}
          <LinkButton href="/" variant="outline" size="sm" className="mt-1">
            <LayoutDashboard className="size-4" />
            Back to dashboard
          </LinkButton>
        </EmptyState>
      </PageBody>
    </>
  );
}
