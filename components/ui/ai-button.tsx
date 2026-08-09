import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A Button with an "AI" look — a subtle violet→fuchsia gradient tint — so AI
 * affordances read as distinct from ordinary actions. Accepts all Button props.
 */
function AiButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-600",
        "hover:from-violet-500/20 hover:to-fuchsia-500/20 hover:text-violet-700",
        "dark:border-violet-400/30 dark:text-violet-300 dark:hover:text-violet-200",
        className,
      )}
      {...props}
    />
  );
}

export { AiButton };
