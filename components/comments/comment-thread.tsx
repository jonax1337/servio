"use client";

import { useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Lock, Send, Loader2, MessageSquare, Activity as ActivityIcon, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { RichTextEditor, type MentionUser, type RichTextEditorHandle } from "@/components/ui/rich-text-editor";
import { AiButton } from "@/components/ui/ai-button";
import { draftReply, improveText } from "@/lib/actions/ai";
import { AI_TEASER_MESSAGE } from "@/lib/constants";
import { ComposerAttachments } from "@/components/comments/composer-attachments";
import { sanitizeCommentHtml } from "@/lib/markdown";
import { iconForMime, formatBytes, type AttachmentRow } from "@/lib/attachments-ui";
import { formatDistanceToNow } from "date-fns";

export type ThreadComment = {
  id: string;
  author: string;
  body: string;
  bodyHtml: string | null;
  isInternal: boolean;
  createdAt: Date;
  attachments: AttachmentRow[];
};

function CommentAttachments({ attachments }: { attachments: AttachmentRow[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {attachments.map((a) => {
        const Icon = iconForMime(a.mime);
        return (
          <a
            key={a.id}
            href={`/api/files/${a.id}`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:border-primary/40 hover:text-primary"
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-48 truncate font-medium">{a.filename}</span>
            <span className="text-muted-foreground">{formatBytes(a.size)}</span>
          </a>
        );
      })}
    </div>
  );
}
export type ThreadEvent = { id: string; who: string; summary: string; createdAt: Date };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      Send
    </Button>
  );
}

/** AI helpers in the composer footer — only rendered when a ticket id is given
 *  and AI is configured. Draft writes into the editor; Improve rewrites what's
 *  already typed. Both go through the editor handle so the hidden input stays synced. */
function AiComposerButtons({
  ticketId,
  editorRef,
  teaser = false,
}: {
  ticketId: number;
  editorRef: React.RefObject<RichTextEditorHandle | null>;
  teaser?: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"draft" | "improve" | null>(null);

  function onDraft() {
    if (teaser) return void toast.info(AI_TEASER_MESSAGE);
    setBusy("draft");
    start(async () => {
      const res = await draftReply(ticketId);
      setBusy(null);
      if (!res.ok) return void toast.error(res.error);
      editorRef.current?.setText(res.text);
      toast.success("Reply drafted");
    });
  }

  function onImprove() {
    if (teaser) return void toast.info(AI_TEASER_MESSAGE);
    const current = editorRef.current?.getText() ?? "";
    if (current.trim().length < 2) return void toast.error("Nothing to improve.");
    setBusy("improve");
    start(async () => {
      const res = await improveText(current);
      setBusy(null);
      if (!res.ok) return void toast.error(res.error);
      editorRef.current?.setText(res.text);
      toast.success("Text improved");
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <AiButton type="button" onClick={onDraft} disabled={pending}>
        {pending && busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        Suggest reply
      </AiButton>
      <AiButton type="button" onClick={onImprove} disabled={pending}>
        {pending && busy === "improve" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        Improve
      </AiButton>
    </div>
  );
}

export function CommentThread({
  idField,
  entityId,
  comments,
  activity,
  addAction,
  allowInternal = true,
  placeholder = "Write a reply…",
  mentionUsers,
  attachTarget,
  aiTicketId,
  aiTeaser = false,
}: {
  idField: string;
  entityId: number;
  comments: ThreadComment[];
  activity: ThreadEvent[];
  addAction: (formData: FormData) => void | Promise<void>;
  allowInternal?: boolean;
  placeholder?: string;
  mentionUsers?: MentionUser[];
  attachTarget?: { ticketId: number };
  /** When set, shows AI reply/improve helpers in the composer. */
  aiTicketId?: number;
  /** When true, the AI buttons are a disabled "teaser" (click shows a hint, no call). */
  aiTeaser?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const editorRef = useRef<RichTextEditorHandle | null>(null);

  return (
    <Tabs defaultValue="comments">
      <TabsList>
        <TabsTrigger value="comments">
          <MessageSquare className="size-4" /> Comments
          <span className="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums">{comments.length}</span>
        </TabsTrigger>
        <TabsTrigger value="activity">
          <ActivityIcon className="size-4" /> Activity
          <span className="ml-1 rounded-full bg-muted px-1.5 text-xs tabular-nums">{activity.length}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="comments" className="mt-4">
        <div className="grid gap-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <UserAvatar name={c.author} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.author}</span>
                  {c.isInternal ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Lock className="size-2.5" /> Internal
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
                </div>
                <div className={`mt-1 rounded-lg border p-3 text-sm ${c.isInternal ? "border-amber-500/20 bg-amber-500/5" : "bg-card"}`}>
                  {c.bodyHtml ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none [&_[data-mention-id]]:rounded [&_[data-mention-id]]:bg-primary/10 [&_[data-mention-id]]:px-1 [&_[data-mention-id]]:font-medium [&_[data-mention-id]]:text-primary"
                      dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(c.bodyHtml) }}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  )}
                </div>
                <CommentAttachments attachments={c.attachments} />
              </div>
            </div>
          ))}
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet. Start the conversation below.</p>
          ) : null}

          <form
            ref={ref}
            action={async (fd) => { await addAction(fd); ref.current?.reset(); }}
            className="mt-1 grid gap-2 rounded-xl border bg-card p-3"
          >
            <input type="hidden" name={idField} value={entityId} />
            <RichTextEditor
              name="bodyHtml"
              required
              placeholder={placeholder}
              ariaLabel="Reply"
              mentionUsers={mentionUsers}
              onReady={(handle) => { editorRef.current = handle; }}
            />
            {attachTarget ? <ComposerAttachments ticketId={attachTarget.ticketId} /> : null}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <div className="flex flex-wrap items-center gap-2">
                {allowInternal ? (
                  <div className="flex items-center gap-2">
                    <Checkbox id={`internal-${entityId}`} name="isInternal" />
                    <Label htmlFor={`internal-${entityId}`} className="text-xs text-muted-foreground">
                      Internal note
                    </Label>
                  </div>
                ) : null}
                {aiTicketId ? <AiComposerButtons ticketId={aiTicketId} editorRef={editorRef} teaser={aiTeaser} /> : null}
              </div>
              <SubmitButton />
            </div>
          </form>
        </div>
      </TabsContent>

      <TabsContent value="activity" className="mt-4">
        <div className="grid gap-3">
          {activity.map((a) => (
            <div key={a.id} className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-muted">
                <ActivityIcon className="size-3" />
              </span>
              <span>
                <span className="font-medium text-foreground">{a.who}</span> {a.summary.toLowerCase()} · {formatDistanceToNow(a.createdAt, { addSuffix: true })}
              </span>
            </div>
          ))}
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
          ) : null}
        </div>
      </TabsContent>
    </Tabs>
  );
}
