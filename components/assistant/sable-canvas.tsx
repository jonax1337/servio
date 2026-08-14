"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Check, Copy, FolderPlus, Loader2, MessageSquarePlus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SableMark } from "@/components/sable-mark";
import { CodeEditor } from "@/components/ui/code-editor";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { useSable } from "./sable-provider";
import { ProposalCard, type ProposalStatus } from "./proposal-card";
import { saveArtifactToProject } from "@/lib/actions/ai-project-files";
import { listProjects, type AssistantProposal, type ProjectSummary } from "@/lib/actions/ai-assistant";

/** Map a language hint → a file extension for a saved artifact. */
const LANG_EXT: Record<string, string> = {
  bash: "sh",
  sh: "sh",
  shell: "sh",
  powershell: "ps1",
  ps1: "ps1",
  pwsh: "ps1",
  bat: "bat",
  batch: "bat",
  cmd: "cmd",
  python: "py",
  py: "py",
  ruby: "rb",
  go: "go",
  rust: "rs",
  java: "java",
  c: "c",
  "c++": "cpp",
  cpp: "cpp",
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  sql: "sql",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  html: "html",
  css: "css",
  dockerfile: "dockerfile",
  markdown: "md",
  md: "md",
};

/** File extensions we treat as CODE (raw monospace, never rich text). */
const CODE_EXTS = new Set([
  "sh", "ps1", "bat", "cmd", "py", "rb", "go", "rs", "java", "c", "cpp", "cc",
  "h", "hpp", "js", "mjs", "cjs", "ts", "tsx", "jsx", "sql", "json", "yaml",
  "yml", "toml", "ini", "xml", "html", "htm", "css", "pl", "php", "dockerfile",
]);

/** The lowercase extension of a filename (without the dot), or "". */
function fileExt(name?: string): string {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/**
 * A draft is CODE (shown in a plain monospace editor, saved verbatim) when its
 * language or filename points at a code type — anything but a prose document
 * (markdown/plain text), which stays in the rich-text editor.
 */
function isCodeDoc(doc: { language?: string; filename?: string }): boolean {
  const lang = (doc.language ?? "").trim().toLowerCase();
  if (lang) {
    const ext = LANG_EXT[lang] ?? lang;
    if (ext !== "md" && ext !== "txt" && CODE_EXTS.has(ext)) return true;
  }
  const fext = fileExt(doc.filename);
  return !!fext && CODE_EXTS.has(fext);
}

/**
 * Pull the runnable code out of a code draft: if the model wrapped it in fenced
 * ``` blocks (often with prose between/around them), keep ONLY the block bodies
 * so the canvas shows a clean script — not the surrounding explanation. Falls
 * back to the trimmed text when there are no fences.
 */
function extractCode(markdown: string): string {
  const blocks = [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) =>
    m[1].replace(/\n+$/, ""),
  );
  if (blocks.length) return blocks.join("\n\n");
  return markdown.trim();
}

/** Turn a title into a filesystem-friendly slug (letters/digits/dashes). */
function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "document";
}

/**
 * Derive a sensible saved filename for the artifact: prefer the model-supplied
 * `filename`, else slugify the title + an extension inferred from `language`
 * (default `.md`).
 */
function artifactFilename(doc: { title: string; filename?: string; language?: string }): string {
  if (doc.filename && doc.filename.trim()) return doc.filename.trim();
  const lang = (doc.language ?? "").trim().toLowerCase();
  const ext = LANG_EXT[lang] ?? "md";
  return `${slugify(doc.title)}.${ext}`;
}

/**
 * The Artifacts / Canvas side panel. Sable hands a long document draft (runbook,
 * RCA, change doc, KB draft) to this pane via `draft_document`; the human edits
 * it in a rich-text editor seeded from the draft markdown, then can copy it,
 * drop it into the chat composer, or publish it as a Knowledge Base article
 * (through the existing approve-first proposal path — nothing is written until
 * the human approves the card, re-validated server-side by applyAssistantProposal).
 *
 * Session-only (no DB): the draft lives on the provider for the window session.
 */
export function SableCanvas() {
  const sable = useSable();
  const doc = sable.canvasDoc;

  const isCode = useMemo(() => (doc ? isCodeDoc(doc) : false), [doc]);

  // Prose drafts → sanitised HTML for the rich editor. Keyed by title so a NEW
  // draft re-seeds (a fresh RichTextEditor mount via the panel key).
  const seedHtml = useMemo(
    () => (doc && !isCode ? renderMarkdown(doc.markdown, "markdown") : ""),
    [doc, isCode],
  );
  // Code drafts → the runnable code, with any surrounding prose/fences stripped.
  const seedCode = useMemo(
    () => (doc && isCode ? extractCode(doc.markdown) : ""),
    [doc, isCode],
  );

  const handleRef = useRef<RichTextEditorHandle | null>(null);
  // Live HTML mirror of the editor, for "Save as KB article" (article bodies are
  // persisted as HTML). Seeded so a publish before any edit still has the draft.
  const [html, setHtml] = useState(seedHtml);
  // Editable code buffer for code drafts. Re-seeded when a new draft lands.
  const [code, setCode] = useState(seedCode);
  useEffect(() => {
    setCode(seedCode);
  }, [seedCode]);

  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Current editable content, whichever editor is active.
  const currentText = useCallback(
    () => (isCode ? code : handleRef.current?.getText() ?? doc?.markdown ?? ""),
    [isCode, code, doc],
  );

  const copy = useCallback(async () => {
    const text = currentText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }, [currentText]);

  const insert = useCallback(() => {
    const text = currentText();
    if (!text.trim()) return;
    sable.insertIntoComposer(text);
    toast.success("Added to the chat composer.");
  }, [sable, currentText]);

  if (!doc) return null;

  return (
    <aside className="hidden min-h-0 w-[440px] shrink-0 flex-col border-l bg-muted/10 lg:flex xl:w-[520px]">
      <header className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sable text-sable-foreground">
          <SableMark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {isCode ? artifactFilename(doc) : "Canvas"}
          </p>
          <p className="truncate font-display text-sm font-semibold leading-tight tracking-tight text-foreground">
            {doc.title}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close canvas"
          onClick={sable.closeCanvas}
        >
          <X className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isCode ? (
          <CodeEditor
            key={doc.title}
            value={code}
            onValueChange={setCode}
            language={doc.language ?? fileExt(doc.filename)}
            ariaLabel="Code canvas"
            className="min-h-full"
          />
        ) : (
          <RichTextEditor
            key={doc.title}
            name="sable-canvas-body"
            ariaLabel="Document canvas"
            defaultHTML={seedHtml}
            onChangeHTML={setHtml}
            onReady={(h) => {
              handleRef.current = h;
            }}
            placeholder="The document draft appears here — edit it freely."
          />
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={insert}>
            <MessageSquarePlus className="size-3.5" />
            Insert into chat
          </Button>
          <SaveToProjectMenu
            filename={artifactFilename(doc)}
            getContent={currentText}
            defaultProjectId={sable.projectId}
          />
          {/* A script isn't a KB article — only offer publishing for prose docs. */}
          {!isCode ? (
            <Button
              type="button"
              size="sm"
              className={cn("gap-1.5 bg-sable text-sable-foreground hover:bg-sable/90", publishing && "opacity-70")}
              onClick={() => setPublishing((p) => !p)}
            >
              <Save className="size-3.5" />
              Save as KB article
            </Button>
          ) : null}
        </div>

        {publishing && !isCode ? (
          <SableCanvasPublish title={doc.title} html={html || seedHtml} />
        ) : null}
      </footer>
    </aside>
  );
}

/**
 * "Save to project" from the canvas: a project picker so an artifact can land in
 * ANY of the user's projects — not only when the current chat is project-bound.
 * The chat's own project (if any) is listed first and marked "current". Persists
 * the currently-edited content (raw code, or the prose text) via
 * `saveArtifactToProject`, which access-checks the target project server-side.
 */
function SaveToProjectMenu({
  filename,
  getContent,
  defaultProjectId,
}: {
  filename: string;
  getContent: () => string;
  defaultProjectId: string | null;
}) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (projects || loading) return;
    setLoading(true);
    listProjects()
      .then((rows) => setProjects(rows.filter((p) => !p.archived)))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [projects, loading]);

  const save = useCallback(
    async (projectId: string, projectName: string) => {
      const content = getContent();
      if (!content.trim()) {
        toast.error("Nothing to save.");
        return;
      }
      setSavingId(projectId);
      try {
        const res = await saveArtifactToProject(projectId, { name: filename, content });
        if (res.ok) toast.success(`Saved “${res.file.name}” to ${projectName}.`);
        else toast.error(res.error || "Couldn't save to the project.");
      } catch {
        toast.error("Couldn't save to the project.");
      } finally {
        setSavingId(null);
      }
    },
    [filename, getContent],
  );

  // The chat's bound project floats to the top (marked "current").
  const ordered = useMemo(() => {
    if (!projects) return [];
    const rank = (p: ProjectSummary) => (p.id === defaultProjectId ? 0 : 1);
    return [...projects].sort((a, b) => rank(a) - rank(b));
  }, [projects, defaultProjectId]);

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" size="sm" className="gap-1.5" />}
      >
        <FolderPlus className="size-3.5" />
        Save to project
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 min-w-52">
        {loading ? (
          <DropdownMenuItem disabled>
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </DropdownMenuItem>
        ) : null}
        {!loading && ordered.length === 0 ? (
          <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
        ) : null}
        {ordered.map((p) => (
          <DropdownMenuItem
            key={p.id}
            disabled={savingId !== null}
            onClick={() => save(p.id, p.name)}
          >
            <Boxes className="size-3.5" />
            <span className="min-w-0 truncate">{p.name}</span>
            {p.id === defaultProjectId ? (
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                current
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Save as KB article" reuses Sable's approve-first path: we synthesise an
 * `article.create` proposal (body = the edited HTML) and render the SAME
 * ProposalCard the chat uses. Approve routes through applyAssistantProposal,
 * which re-checks the agent's role + re-validates the args server-side, so no
 * bespoke write path is introduced. The article lands as a DRAFT.
 *
 * Note: approval requires a saved conversation to authorise against; when the
 * chat hasn't been created yet (fresh, unsent), we prompt the user to send a
 * message first (a one-line hint) rather than fail on approve.
 */
function SableCanvasPublish({ title, html }: { title: string; html: string }) {
  const sable = useSable();
  const conversationId = sable.conversationId;

  const proposal = useMemo<AssistantProposal>(
    () => ({
      id: "canvas-article",
      operationId: "article.create",
      args: { title, body: html, visibility: "INTERNAL" },
      label: `Create article “${title}”`,
    }),
    [title, html],
  );

  const [status, setStatus] = useState<ProposalStatus>({ status: "idle" });

  if (!conversationId) {
    return (
      <p className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
        Send a message in the chat first, then you can publish this draft as a
        Knowledge Base article.
      </p>
    );
  }

  return (
    <ProposalCard
      conversationId={conversationId}
      proposal={proposal}
      status={status}
      onStatusChange={setStatus}
    />
  );
}
