"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AI_ASSISTANT_NAME } from "@/lib/constants";
import {
  SableFab,
  SableHeader,
  SABLE_PANEL_FRAME,
  SABLE_MIN_SIZE,
  SABLE_ENTER,
  SABLE_EXIT,
} from "@/components/assistant/sable-chrome";
import { PortalThread } from "./portal-thread";

/**
 * The self-service help-center assistant — the SAME Sable window + assistant-ui
 * Thread as the console, USER-scoped and ephemeral. An icon-only launcher opens
 * a small bottom-right card (no maximised state here).
 */
export function VioWidget({
  firstName,
  previewOnly = false,
}: {
  firstName: string;
  previewOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 160);
  };

  return (
    <>
      {!open ? <SableFab onClick={() => setOpen(true)} /> : null}

      {open ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end p-4">
          <div
            role="dialog"
            aria-label={`${AI_ASSISTANT_NAME} assistant`}
            className={cn(
              "pointer-events-auto relative",
              SABLE_PANEL_FRAME,
              SABLE_MIN_SIZE,
              closing ? SABLE_EXIT : SABLE_ENTER,
            )}
          >
            <SableHeader
              subtitle="Help Center assistant"
              extra={
                previewOnly ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Preview
                  </span>
                ) : null
              }
            >
              <Button type="button" variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Close">
                <X className="size-4" />
              </Button>
            </SableHeader>

            {previewOnly ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <span className="grid size-12 place-items-center rounded-xl bg-vio text-vio-foreground">
                  <Sparkles className="size-6" />
                </span>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {AI_ASSISTANT_NAME} is a preview here — ask your administrator to enable the AI
                  assistant. In the meantime, you can browse answers or open a request.
                </p>
              </div>
            ) : (
              <PortalThread firstName={firstName} />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
