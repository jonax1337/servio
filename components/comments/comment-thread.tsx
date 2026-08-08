"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Lock, Send, Loader2, MessageSquare, Activity as ActivityIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

export type ThreadComment = {
  id: string;
  author: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
};
export type ThreadEvent = { id: string; who: string; summary: string; createdAt: Date };

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      Send
    </Button>
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
}: {
  idField: string;
  entityId: number;
  comments: ThreadComment[];
  activity: ThreadEvent[];
  addAction: (formData: FormData) => void | Promise<void>;
  allowInternal?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);

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
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="text-xs">{initials(c.author)}</AvatarFallback>
              </Avatar>
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
                <div className={`mt-1 rounded-lg border p-3 text-sm whitespace-pre-wrap ${c.isInternal ? "border-amber-500/20 bg-amber-500/5" : "bg-card"}`}>
                  {c.body}
                </div>
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
            <Textarea name="body" required placeholder={placeholder} className="min-h-20 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" />
            <div className="flex items-center justify-between border-t pt-2">
              {allowInternal ? (
                <div className="flex items-center gap-2">
                  <Checkbox id={`internal-${entityId}`} name="isInternal" />
                  <Label htmlFor={`internal-${entityId}`} className="text-xs text-muted-foreground">
                    Internal note
                  </Label>
                </div>
              ) : <span />}
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
