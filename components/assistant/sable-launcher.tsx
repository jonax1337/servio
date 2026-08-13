"use client";

import { useSable } from "./sable-provider";
import { SableFab } from "./sable-chrome";

/**
 * The always-present floating action button (bottom-right). Re-opens Sable in
 * the state it was last left in (min or max) with the last conversation
 * restored. Hidden whenever a window is already on screen. Shares its look with
 * the portal launcher via <SableFab>.
 */
export function SableLauncher() {
  const sable = useSable();
  if (sable.state !== "closed") return null;
  return <SableFab beta onClick={sable.openLast} />;
}
