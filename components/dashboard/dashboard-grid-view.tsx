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

  // Desktop: exact RGL grid. Narrow/mobile (or before we've measured): a single
  // stacked column with a fixed per-widget height so charts still fill their card.
  const useGrid = mounted && width >= 768;

  return (
    <div ref={containerRef}>
      {useGrid ? (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 120, margin: [16, 16], containerPadding: [0, 0] }}
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
        <div className="grid grid-cols-1 gap-4">
          {widgets.map((w) => (
            <div key={w.id} style={{ height: Math.max(120, Math.min(4, Math.max(1, w.h)) * 120) }}>
              <WidgetCard widget={w} data={dataById[w.id]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
