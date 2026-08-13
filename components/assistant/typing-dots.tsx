"use client";

/** Three bouncing dots shown while Sable is generating a reply. */
export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-sable motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
