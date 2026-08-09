import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a minute count as a compact "2h 15m" / "45m" / "3h" string. */
export function formatMinutes(mins: number) {
  const m = Math.max(0, Math.floor(mins));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h}h ${rest}m`;
  if (h) return `${h}h`;
  return `${rest}m`;
}
