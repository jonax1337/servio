"use client";

import { SableWindow } from "./sable-window";
import { SableLauncher } from "./sable-launcher";

/**
 * Client-side mount for the global Sable surface: the window (min/max overlay) and
 * the floating action button. Gated by the server on `configured || teaser`, so
 * this only renders when AI is enabled (or previewed). Sits inside <SableProvider>
 * alongside the page so both share the same window state.
 */
export function SableMount({
  configured,
  teaser,
  isAdmin,
}: {
  configured: boolean;
  teaser: boolean;
  isAdmin: boolean;
}) {
  return (
    <>
      <SableWindow isAdmin={isAdmin} disabled={!configured} teaser={teaser && !configured} />
      {configured || teaser ? <SableLauncher /> : null}
    </>
  );
}
