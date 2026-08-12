"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight code block for the chatcn Markdown renderer — a styled `pre` with
 * a copy button. Deliberately no Shiki/syntax-highlighting dependency; `lang`
 * and `theme` are accepted for API-compatibility but not used.
 */
export function CodeBlock({
  children,
  className,
}: {
  children: string;
  lang?: string;
  theme?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(children).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={cn("group/code relative my-2", className)}>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-background/70 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/code:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
      <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs leading-relaxed">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}
