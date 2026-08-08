import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  href?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "muted";
}) {
  const tones: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    warning: "text-amber-500 bg-amber-500/10",
    danger: "text-red-500 bg-red-500/10",
    muted: "text-muted-foreground bg-muted",
  };

  const inner = (
    <div className="group relative flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      {Icon ? (
        <div className={cn("grid size-11 place-items-center rounded-lg", tones[tone])}>
          <Icon className="size-5" />
        </div>
      ) : null}
      <div className="grid gap-0.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight font-display">
          {value}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {hint ? <span className="text-[11px] text-muted-foreground/80">{hint}</span> : null}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
