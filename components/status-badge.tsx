import { cn } from "@/lib/utils";
import { TONE_CLASSES, metaFor, type Meta, type Tone } from "@/lib/constants";

export function ToneBadge({
  meta,
  className,
  dot = false,
}: {
  meta: Meta;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      {dot ? (
        <span className="size-1.5 rounded-full bg-current opacity-80" />
      ) : null}
      {meta.label}
    </span>
  );
}

export function StatusBadge({
  map,
  value,
  dot = true,
  className,
}: {
  map: Record<string, Meta>;
  value: string | null | undefined;
  dot?: boolean;
  className?: string;
}) {
  return <ToneBadge meta={metaFor(map, value)} dot={dot} className={className} />;
}

/** Small priority indicator with signal bars. */
export function PriorityDot({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn("inline-block size-2.5 rounded-full", TONE_CLASSES[tone])}
    />
  );
}
