"use client";

import { createContext, useContext, useMemo } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "@ai-sdk/react";
import { Thread } from "@/components/thread";
import { AI_ASSISTANT_NAME } from "@/lib/constants";
import { SableMark } from "@/components/sable-mark";
import { useSableChatAdapters } from "@/components/assistant/sable-adapters";
import { PortalToolUI } from "./portal-tool-ui";

// Tappable starter prompts shown on the empty portal chat.
const PORTAL_SUGGESTIONS = [
  "I can't log in",
  "Reset my password",
  "Request a new laptop",
  "What's the status of my tickets?",
];

/** The signed-in user's first name, for the personalised empty-state greeting. */
const FirstNameContext = createContext("");

/** Empty-state greeting (replaces a seeded message so the suggestions show). */
function PortalWelcome() {
  const firstName = useContext(FirstNameContext);
  return (
    <div className="aui-thread-welcome-root mb-6 flex flex-col items-center gap-3 px-4 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-sable text-sable-foreground">
        <SableMark className="size-6" />
      </span>
      <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-xl font-semibold duration-200">
        Hi {firstName}! I&apos;m {AI_ASSISTANT_NAME}.
      </h1>
      <p className="text-muted-foreground max-w-xs text-sm">
        Ask me anything, attach a screenshot of an error, and I&apos;ll find an answer, point you to
        the right service, or open a request for you.
      </p>
    </div>
  );
}

const PORTAL_COMPONENTS = { ToolFallback: PortalToolUI, Welcome: PortalWelcome };

/**
 * The self-service (portal) chat — the SAME assistant-ui Thread as the console,
 * bound to the ephemeral portal streaming route (`/api/portal/assistant`, USER
 * scope, no persistence — the runtime holds the transcript) with the portal's
 * confirm-to-create tool UI, image/text attachments + voice dictation, and
 * tappable starter prompts.
 */
export function PortalThread({ firstName }: { firstName: string }) {
  const transport = useMemo(
    () => new AssistantChatTransport<UIMessage>({ api: "/api/portal/assistant" }),
    [],
  );

  const adapters = useSableChatAdapters();

  const runtime = useChatRuntime<UIMessage>({ transport, adapters });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <FirstNameContext.Provider value={firstName}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Thread components={PORTAL_COMPONENTS} suggestions={PORTAL_SUGGESTIONS} />
        </div>
      </FirstNameContext.Provider>
    </AssistantRuntimeProvider>
  );
}
