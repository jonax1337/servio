"use client";

/**
 * Read-only, syntax-highlighted code block for Sable's artifact canvas.
 *
 * Unlike the chat's `shiki-highlighter` (which uses `react-shiki/web`'s JS regex
 * engine — lean and streaming-safe, but it silently falls back to plaintext on
 * grammars the JS engine can't handle, e.g. PowerShell), this uses the FULL
 * `react-shiki` with the WASM Oniguruma engine so EVERY language a user might
 * draft (ps1, bash, python, sql, …) highlights correctly. It's heavier, so it's
 * lazy-loaded (next/dynamic) only when the canvas actually shows code.
 */

import ShikiHighlighter, { type ShikiHighlighterProps } from "react-shiki";

import { cn } from "@/lib/utils";

const THEMES: ShikiHighlighterProps["theme"] = {
  light: "github-light",
  dark: "github-dark",
};

export default function CanvasCode({
  code,
  language,
  showLineNumbers = true,
}: {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}) {
  return (
    <ShikiHighlighter
      language={language || "text"}
      theme={THEMES}
      defaultColor="light-dark()"
      showLanguage={false}
      showLineNumbers={showLineNumbers}
      className={cn(
        "border-border/50 overflow-x-auto rounded-xl border text-[13px] leading-relaxed",
        "[&_pre]:!bg-muted/30 [&_pre]:!m-0 [&_pre]:!rounded-xl [&_pre]:overflow-x-auto [&_pre]:p-3.5",
      )}
    >
      {code}
    </ShikiHighlighter>
  );
}
