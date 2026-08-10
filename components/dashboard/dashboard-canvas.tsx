"use client";

import "react-grid-layout/css/styles.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import { GripVertical, Pencil, Trash2, Plus, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WidgetBody } from "@/components/dashboard/widget-card";
import { WidgetConfigDialog, type EditorOptions } from "@/components/dashboard/widget-config-dialog";
import { setDashboardLayout } from "@/lib/actions/dashboards";
import { WIDGET_LABELS, type Widget, type Computed } from "@/lib/dashboard/types";

export function DashboardCanvas({
  dashboardId,
  dashboardName,
  initialWidgets,
  dataById,
  options,
}: {
  dashboardId: string;
  dashboardName: string;
  initialWidgets: Widget[];
  dataById: Record<string, Computed>;
  options: EditorOptions;
}) {
  const router = useRouter();
  const { width, containerRef, mounted } = useContainerWidth();
  const [widgets, setWidgets] = useState<Widget[]>(initialWidgets);
  // Which widgets still have valid server-computed data (untouched filters/type).
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set(initialWidgets.map((w) => w.id)));
  const [configOpen, setConfigOpen] = useState(false);
  const [editing, setEditing] = useState<Widget | null>(null);
  const [saving, startSave] = useTransition();

  const layout: Layout = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: Number.isFinite(w.y) ? w.y : 0,
    w: w.w,
    h: w.h,
    minW: 2,
    minH: 1,
  }));

  function onLayoutChange(next: Layout) {
    setWidgets((ws) =>
      ws.map((w) => {
        const l = next.find((n) => n.i === w.id);
        return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
      }),
    );
  }

  function openAdd() {
    setEditing(null);
    setConfigOpen(true);
  }
  function openEdit(w: Widget) {
    setEditing(w);
    setConfigOpen(true);
  }
  function removeWidget(id: string) {
    setWidgets((ws) => ws.filter((w) => w.id !== id));
  }
  function saveWidget(w: Widget) {
    setWidgets((ws) => {
      const exists = ws.some((x) => x.id === w.id);
      if (exists) return ws.map((x) => (x.id === w.id ? { ...w, x: x.x, y: x.y, w: x.w, h: x.h } : x));
      // New widget → drop at the bottom.
      const bottom = ws.reduce((m, x) => Math.max(m, x.y + x.h), 0);
      return [...ws, { ...w, x: 0, y: bottom }];
    });
    // Its data is now stale/absent until the dashboard is saved & recomputed.
    setFreshIds((s) => {
      const n = new Set(s);
      n.delete(w.id);
      return n;
    });
  }

  function save() {
    const fd = new FormData();
    fd.set("id", dashboardId);
    fd.set("layout", JSON.stringify(widgets));
    startSave(async () => {
      await setDashboardLayout(fd);
      router.push(`/?dashboard=${dashboardId}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 backdrop-blur">
        <span className="mr-auto text-sm font-medium">
          Editing <span className="text-muted-foreground">· {dashboardName}</span>
        </span>
        <Button type="button" variant="outline" size="sm" onClick={openAdd}>
          <Plus className="size-4" /> Add widget
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => router.push(`/?dashboard=${dashboardId}`)} disabled={saving}>
          <X className="size-4" /> Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
        </Button>
      </div>

      <div ref={containerRef} className="min-h-[60vh]">
        {mounted && width > 0 ? (
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: 12, rowHeight: 120, margin: [16, 16] }}
            dragConfig={{ enabled: true, handle: ".rgl-drag-handle" }}
            resizeConfig={{ enabled: true, handles: ["se"] }}
            onLayoutChange={onLayoutChange}
          >
            {widgets.map((w) => (
              <div key={w.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
                  <span className="rgl-drag-handle flex min-w-0 flex-1 cursor-move items-center gap-1.5">
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{w.title}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {WIDGET_LABELS[w.type]}
                    </span>
                  </span>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => openEdit(w)} aria-label="Edit widget">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeWidget(w.id)} aria-label="Remove widget" className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <div className="h-[calc(100%-2.5rem)] overflow-auto p-3">
                  {freshIds.has(w.id) && dataById[w.id] ? (
                    <WidgetBody data={dataById[w.id]} />
                  ) : (
                    <p className="grid h-full place-items-center text-center text-xs text-muted-foreground">
                      Save the dashboard to see this widget&apos;s data.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </GridLayout>
        ) : null}
      </div>

      <WidgetConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        initial={editing}
        options={options}
        onSave={saveWidget}
      />
    </div>
  );
}
