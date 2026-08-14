"use client";

/**
 * A lightweight, editable code editor with syntax highlighting — a transparent
 * textarea layered over Prism-highlighted markup (via `react-simple-code-editor`).
 * Token colours live in `app/globals.css` under `.sable-code` (theme-aware).
 * Used by Sable's canvas for `draft_document` code/script drafts, which must read
 * and save as a clean monospace file, never as rich text.
 */

import Editor from "react-simple-code-editor";
import Prism from "prismjs";
// Order matters: base grammars before the dialects that extend them.
import "prismjs/components/prism-markup"; // html / xml
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-batch";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-docker";

import { cn } from "@/lib/utils";

/** Map our language/extension hints → a Prism grammar key. */
const PRISM_LANG: Record<string, string> = {
  sh: "bash", shell: "bash", bash: "bash",
  ps1: "powershell", powershell: "powershell", pwsh: "powershell",
  bat: "batch", cmd: "batch", batch: "batch",
  py: "python", python: "python",
  sql: "sql",
  json: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml",
  ini: "ini",
  xml: "markup", html: "markup", htm: "markup",
  css: "css",
  go: "go",
  rs: "rust", rust: "rust",
  java: "java",
  c: "c",
  cpp: "cpp", "c++": "cpp", cc: "cpp", hpp: "cpp",
  h: "c",
  js: "javascript", mjs: "javascript", cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  rb: "ruby", ruby: "ruby",
  dockerfile: "docker", docker: "docker",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Resolve the Prism grammar for a language hint, if we bundled it. */
function grammarFor(language?: string): { key: string; grammar: Prism.Grammar | undefined } {
  const key = PRISM_LANG[(language ?? "").trim().toLowerCase()] ?? "";
  return { key, grammar: key ? Prism.languages[key] : undefined };
}

export function CodeEditor({
  value,
  onValueChange,
  language,
  readOnly = false,
  ariaLabel = "Code editor",
  className,
}: {
  value: string;
  onValueChange?: (next: string) => void;
  language?: string;
  readOnly?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const { key, grammar } = grammarFor(language);
  const highlight = (code: string): string =>
    grammar ? Prism.highlight(code, grammar, key) : escapeHtml(code);

  return (
    <Editor
      value={value}
      onValueChange={onValueChange ?? (() => {})}
      highlight={highlight}
      readOnly={readOnly}
      padding={12}
      tabSize={2}
      insertSpaces
      textareaClassName="focus:outline-none focus-visible:outline-none"
      className={cn(
        "sable-code min-h-full rounded-lg border bg-card font-mono text-[12.5px] leading-relaxed text-foreground",
        className,
      )}
      aria-label={ariaLabel}
    />
  );
}
