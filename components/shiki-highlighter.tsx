"use client";

import ShikiHighlighter, {
  type ShikiHighlighterProps,
} from "react-shiki/web";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import type { FC } from "react";

import { cn } from "@/lib/utils";

/**
 * Streaming-safe Shiki syntax highlighter for Sable's markdown code blocks.
 *
 * Wired into `memoizeMarkdownComponents` as the `SyntaxHighlighter` slot, this
 * replaces the plain `<pre><code>` render for fenced blocks. `react-shiki`
 * highlights asynchronously and shows unstyled code until the highlighter is
 * ready, so a block streaming in renders as plain text and then "upgrades" in
 * place — no flash of empty content, no layout shift.
 *
 * Themes are the monochrome-friendly `github-light` / `github-dark` pair, keyed
 * off the site color-scheme via `defaultColor="light-dark()"`. The `CodeHeader`
 * (rendered above by the markdown pipeline) already shows the language + copy
 * button, so we suppress Shiki's own language chip and match the existing
 * `pre` chrome (rounded-b-xl, top-borderless, muted surface).
 */

const THEMES: ShikiHighlighterProps["theme"] = {
  light: "github-light",
  dark: "github-dark",
};

export const SyntaxHighlighter: FC<Omit<SyntaxHighlighterProps, "node">> = ({
  code,
  language,
}) => {
  return (
    <ShikiHighlighter
      language={language || "text"}
      theme={THEMES}
      defaultColor="light-dark()"
      showLanguage={false}
      delay={80}
      className={cn(
        "aui-md-shiki border-border/50 mt-0 overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 text-[13px] leading-relaxed",
        // Neutralise react-shiki's own background so it inherits our muted pre surface.
        "[&_pre]:!bg-muted/30 [&_pre]:!m-0 [&_pre]:!rounded-b-xl [&_pre]:!rounded-t-none [&_pre]:overflow-x-auto [&_pre]:p-3.5",
      )}
    >
      {code}
    </ShikiHighlighter>
  );
};
