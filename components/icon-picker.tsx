"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CatalogIcon, CATALOG_ICON_NAMES } from "@/components/catalog/catalog-icon";

/**
 * A grid of curated Lucide icons an admin can pick from. Works two ways:
 * - controlled: pass `value` + `onChange` (e.g. inside a stateful editor)
 * - uncontrolled form field: pass `name` (+ optional `defaultValue`) and it
 *   renders its own hidden input so a plain `<form action>` picks it up.
 */
export function IconPicker({
  name,
  defaultValue,
  value,
  onChange,
  className,
}: {
  name?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (v: string) => void;
  className?: string;
}) {
  const [internal, setInternal] = useState(value ?? defaultValue ?? "ShoppingBag");
  const current = value ?? internal;
  const set = (v: string) => {
    setInternal(v);
    onChange?.(v);
  };

  return (
    <>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <div className={cn("flex flex-wrap gap-1.5 rounded-lg border p-2", className)}>
        {CATALOG_ICON_NAMES.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={n}
            onClick={() => set(n)}
            className={cn(
              "grid size-9 place-items-center rounded-md border transition-colors",
              current === n
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            <CatalogIcon name={n} className="size-4.5" />
          </button>
        ))}
      </div>
    </>
  );
}
