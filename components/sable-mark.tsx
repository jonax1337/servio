import { Astroid, type LucideProps } from "lucide-react";

/**
 * Sable's brand icon — lucide's **Astroid**: a four-cusped star with concave,
 * swept-in sides (the shape people know from Gemini), used everywhere Sable
 * appears instead of the busy three-star `Sparkles`. One place to swap the whole
 * app's Sable icon; size it with a Tailwind `size-*` class like any lucide icon.
 */
export function SableMark(props: LucideProps) {
  return <Astroid strokeWidth={1.5} {...props} />;
}
