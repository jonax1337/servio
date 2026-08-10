import { getSessionUser, hasRole, type Role } from "@/lib/session";
import { getFormOptions } from "@/lib/data/options";
import { getVisibleDashboards } from "@/lib/actions/dashboards";
import { computeWidget } from "@/lib/dashboard/compute";
import { DEFAULT_LAYOUT, type Widget, type Computed } from "@/lib/dashboard/types";
import { DashboardPicker } from "@/components/dashboard/dashboard-picker";
import { DashboardCanvas } from "@/components/dashboard/dashboard-canvas";
import { WidgetCard } from "@/components/dashboard/widget-card";
import { PageHeader, PageBody } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { getParam, type SearchParams } from "@/lib/query";
import { Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const dashboardId = getParam(sp, "dashboard");
  const me = await getSessionUser();

  const [opts, dashboards] = await Promise.all([
    getFormOptions(),
    me ? getVisibleDashboards(me.id) : Promise.resolve([]),
  ]);

  const active = dashboardId ? dashboards.find((d) => d.id === dashboardId) : null;
  const activeId = active?.id ?? "default";
  let layout: Widget[] = DEFAULT_LAYOUT;
  if (active) {
    try {
      const parsed = JSON.parse(active.layout);
      if (Array.isArray(parsed) && parsed.length) layout = parsed as Widget[];
    } catch {
      /* fall back to default */
    }
  }

  const editable =
    !!active && !!me && (active.ownerId === me.id || (active.isShared && hasRole(me.role as Role, "MANAGER")));
  const editing = getParam(sp, "edit") === "1" && editable && !!active;

  const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
  const computed = await Promise.all(ordered.map((w) => computeWidget(w)));
  const dataById: Record<string, Computed> = {};
  ordered.forEach((w, i) => (dataById[w.id] = computed[i]));

  // ── Edit mode: the interactive drag/resize canvas ──
  if (editing && active) {
    const editorOptions = {
      agents: opts.agents.map((a) => ({ value: a.id, label: a.name ?? a.email })),
      groups: opts.groups.map((g) => ({ value: g.id, label: g.name })),
      categories: opts.categories.map((c) => ({ value: c.id, label: c.name })),
      services: opts.services.map((s) => ({ value: s.id, label: s.name })),
    };
    return (
      <PageBody className="grid gap-4">
        <DashboardCanvas
          dashboardId={active.id}
          dashboardName={active.name}
          initialWidgets={ordered}
          dataById={dataById}
          options={editorOptions}
        />
      </PageBody>
    );
  }

  // ── View mode: read-only widget grid + picker ──
  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${me?.name?.split(" ")[0] ?? "there"}`}
        description="Your service desk at a glance — pick or build a dashboard."
      >
        {editable ? (
          <LinkButton href={`/?dashboard=${activeId}&edit=1`} variant="outline">
            <Pencil className="size-4" /> Edit
          </LinkButton>
        ) : null}
        <LinkButton href="/tickets/new">New ticket</LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <DashboardPicker
          dashboards={dashboards}
          activeId={activeId}
          currentUserId={me?.id ?? ""}
          canManageShared={!!me && hasRole(me.role as Role, "MANAGER")}
          teams={opts.groups.map((g) => ({ value: g.id, label: g.name }))}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {ordered.map((w, i) => (
            <div key={w.id} style={{ gridColumn: `span ${Math.min(12, Math.max(1, w.w))}` }}>
              <WidgetCard widget={w} data={computed[i]} />
            </div>
          ))}
        </div>
      </PageBody>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
