import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A Button with an "AI" look — a subtle monochrome Onyx tint (the `--vio`
 * tokens) so AI affordances read as distinct from ordinary actions. Accepts
 * all Button props.
 */
function AiButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "border-vio/25 bg-vio-muted/50 text-foreground hover:bg-vio-muted hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { AiButton };
