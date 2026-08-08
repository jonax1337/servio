import { cn } from "@/lib/utils";

/** Servio logo mark — a stylised "service ring" with a spark. */
export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-5"
        aria-hidden="true"
      >
        <path
          d="M12 3a9 9 0 1 0 9 9"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <path
          d="M20 4l-3.2 3.2"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function Wordmark({
  className,
  subtitle,
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo />
      <div className="grid leading-none">
        <span className="font-display text-lg font-semibold tracking-tight">
          Servio
        </span>
        {subtitle ? (
          <span className="text-[11px] font-medium text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}
