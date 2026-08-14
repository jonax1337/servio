"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Copy, FolderPlus, MessageSquarePlus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SableMark } from "@/components/sable-mark";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import { useSable } from "./sable-provider";
import { ProposalCard, type ProposalStatus } from "./proposal-card";
import { saveArtifactToProject } from "@/lib/actions/ai-project-files";
import type { AssistantProposal } from "@/lib/actions/ai-assistant";

/** Map a language hint → a file extension for a saved artifact. */
const LANG_EXT: Record<string, string> = {
  bash: "sh",
  sh: "sh",
  shell: "sh",
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
  xml: "xml",
  html: "html",
  css: "css",
  markdown: "md",
  md: "md",
};

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

  // Seed the editor from the draft markdown → sanitised HTML. Keyed by title so a
  // NEW draft re-seeds the editor (a fresh RichTextEditor mount via the panel key).
  const seedHtml = useMemo(
    () => (doc ? renderMarkdown(doc.markdown, "markdown") : ""),
    [doc],
  );

  const handleRef = useRef<RichTextEditorHandle | null>(null);
  // Live HTML mirror of the editor, for "Save as KB article" (article bodies are
  // persisted as HTML). Seeded so a publish before any edit still has the draft.
  const [html, setHtml] = useState(seedHtml);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);

  const copy = useCallback(async () => {
    const text = handleRef.current?.getText() ?? doc?.markdown ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }, [doc]);

  const insert = useCallback(() => {
    const text = handleRef.current?.getText() ?? doc?.markdown ?? "";
    if (!text.trim()) return;
    sable.insertIntoComposer(text);
    toast.success("Added to the chat composer.");
  }, [sable, doc]);

  // Save the artifact into the active project's files. Persists the EDITED text
  // (the editor content, falling back to the draft markdown) as a real project
  // file so it appears in Files and is retrievable. Enabled only with a project.
  const saveToProject = useCallback(async () => {
    if (!doc || !sable.projectId) return;
    const content = handleRef.current?.getText() ?? doc.markdown;
    if (!content.trim()) {
      toast.error("Nothing to save.");
      return;
    }
    const name = artifactFilename(doc);
    setSaving(true);
    try {
      const res = await saveArtifactToProject(sable.projectId, { name, content });
      if (res.ok) toast.success(`Saved “${res.file.name}” to the project.`);
      else toast.error(res.error || "Couldn't save to the project.");
    } catch {
      toast.error("Couldn't save to the project.");
    } finally {
      setSaving(false);
    }
  }, [doc, sable.projectId]);

  if (!doc) return null;

  return (
    <aside className="hidden min-h-0 w-[440px] shrink-0 flex-col border-l bg-muted/10 lg:flex xl:w-[520px]">
      <header className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sable text-sable-foreground">
          <SableMark className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Canvas
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
          {sable.projectId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("gap-1.5", saving && "opacity-70")}
              disabled={saving}
              onClick={saveToProject}
            >
              <FolderPlus className="size-3.5" />
              {saving ? "Saving…" : "Save to project"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className={cn("gap-1.5 bg-sable text-sable-foreground hover:bg-sable/90", publishing && "opacity-70")}
            onClick={() => setPublishing((p) => !p)}
          >
            <Save className="size-3.5" />
            Save as KB article
          </Button>
        </div>

        {publishing ? (
          <SableCanvasPublish title={doc.title} html={html || seedHtml} />
        ) : null}
      </footer>
    </aside>
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
