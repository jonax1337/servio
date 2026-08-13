"use client";

import { useMemo } from "react";
import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  WebSpeechDictationAdapter,
} from "@assistant-ui/react";

/**
 * The chat runtime adapters shared by the console and portal Sable threads:
 * image + text attachments always, plus browser-native voice dictation where the
 * Web Speech API is available (which flips on the composer's mic button). Kept in
 * one place so both surfaces stay identical.
 */
export function useSableChatAdapters() {
  return useMemo(() => {
    const attachments = new CompositeAttachmentAdapter([
      new SimpleImageAttachmentAdapter(),
      new SimpleTextAttachmentAdapter(),
    ]);
    const canDictate =
      typeof window !== "undefined" && WebSpeechDictationAdapter.isSupported();
    return canDictate
      ? { attachments, dictation: new WebSpeechDictationAdapter() }
      : { attachments };
  }, []);
}
