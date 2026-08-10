"use client";

import "react-grid-layout/css/styles.css";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import { WidgetCard } from "@/components/dashboard/widget-card";
import type { Widget, Computed } from "@/lib/dashboard/types";

/**
 * Read-only dashboard render using react-grid-layout in static mode, so the saved
 * x/y/w/h (including resized heights) are honored exactly — matching the editor.
 * Drag/resize are disabled. Falls back to a simple column grid before mount.
 */
export function DashboardGridView({
  widgets,
  dataById,
}: {
  widgets: Widget[];
  dataById: Record<string, Computed>;
}) {
  const { width, containerRef, mounted } = useContainerWidth();

  const layout: Layout = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: Number.isFinite(w.y) ? w.y : 0,
    w: Math.min(12, Math.max(1, w.w)),
    h: Math.max(1, w.h),
  }));

  return (
    <div ref={containerRef}>
      {mounted && width > 0 ? (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 120, margin: [16, 16] }}
          dragConfig={{ enabled: false }}
          resizeConfig={{ enabled: false }}
        >
          {widgets.map((w) => (
            <div key={w.id}>
              <WidgetCard widget={w} data={dataById[w.id]} />
            </div>
          ))}
        </GridLayout>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {widgets.map((w) => (
            <div key={w.id} style={{ gridColumn: `span ${Math.min(12, Math.max(1, w.w))}` }}>
              <WidgetCard widget={w} data={dataById[w.id]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
