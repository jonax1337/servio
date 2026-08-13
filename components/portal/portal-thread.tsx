"use client";

import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "@ai-sdk/react";
import { Thread } from "@/components/thread";
import { AI_ASSISTANT_NAME } from "@/lib/constants";
import { PortalToolUI } from "./portal-tool-ui";

const COMPONENTS = { ToolFallback: PortalToolUI };

/**
 * The self-service (portal) chat — the SAME assistant-ui Thread as the console,
 * bound to the ephemeral portal streaming route (`/api/portal/assistant`, USER
 * scope, no persistence — the runtime holds the transcript) with the portal's
 * confirm-to-create tool UI.
 */
export function PortalThread({ firstName }: { firstName: string }) {
  const transport = useMemo(
    () => new AssistantChatTransport<UIMessage>({ api: "/api/portal/assistant" }),
    [],
  );

  const greeting: UIMessage[] = useMemo(
    () => [
      {
        id: "greeting",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: `Hi ${firstName}! I'm ${AI_ASSISTANT_NAME}. Ask me anything, attach a screenshot of an error, and I'll find an answer, point you to the right service, or open a request for you.`,
          },
        ],
      },
    ],
    [firstName],
  );

  const runtime = useChatRuntime<UIMessage>({
    transport,
    messages: greeting,
    adapters: {
      attachments: new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
      ]),
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread components={COMPONENTS} />
    </AssistantRuntimeProvider>
  );
}
