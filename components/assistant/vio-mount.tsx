"use client";

import { VioWindow } from "./vio-window";
import { VioFab } from "./vio-fab";

/**
 * Client-side mount for the global Vio surface: the window (min/max overlay) and
 * the floating action button. Gated by the server on `configured || teaser`, so
 * this only renders when AI is enabled (or previewed). Sits inside <VioProvider>
 * alongside the page so both share the same window state.
 */
export function VioMount({
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
      <VioWindow isAdmin={isAdmin} disabled={!configured} teaser={teaser && !configured} />
      {configured || teaser ? <VioFab /> : null}
    </>
  );
}
