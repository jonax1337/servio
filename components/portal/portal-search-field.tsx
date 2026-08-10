import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The canonical portal filter/search input, so the catalog and knowledge-base
 * search bars stay pixel-identical. Purely presentational — works uncontrolled
 * (inside a <form> with name/defaultValue) or controlled (value/onChange).
 */
export function PortalSearchField({
  className,
  wrapperClassName,
  ...props
}: React.ComponentProps<"input"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative max-w-md", wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        className={cn(
          "h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/10",
          className,
        )}
        {...props}
      />
    </div>
  );
}
