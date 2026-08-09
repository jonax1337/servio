"use client";

import * as React from "react";
import Mention from "@tiptap/extension-mention";
import { mergeAttributes } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type MentionUser = { id: string; name: string | null; email: string; image?: string | null };

type Item = { id: string; label: string; user: MentionUser };
type MentionListRef = { onKeyDown: (p: SuggestionKeyDownProps) => boolean };

// The one hard requirement: the node's `id` must serialize to data-mention-id so
// the server's parseMentionIds + the DOMPurify allow-list keep working unchanged.
const ServioMention = Mention.extend({
  atom: true,
  inline: true,
  group: "inline",
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-mention-id"),
        renderHTML: (attrs: { id?: string | null }) => (attrs.id ? { "data-mention-id": attrs.id } : {}),
      },
      label: {
        default: null,
        // Recover the name from "@Name" text when editing a server-sanitized comment
        // (where data-mention-label was stripped as a non-allow-listed data-*).
        parseHTML: (el: HTMLElement) => el.getAttribute("data-mention-label") ?? (el.textContent?.replace(/^@/, "") || null),
        renderHTML: (attrs: { label?: string | null }) => (attrs.label ? { "data-mention-label": attrs.label } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-mention-id]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ class: "mention" }, this.options.HTMLAttributes, HTMLAttributes),
      `@${node.attrs.label ?? node.attrs.id}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs.label ?? node.attrs.id}`;
  },
});

const MentionList = React.forwardRef<MentionListRef, SuggestionProps<Item>>(function MentionList(props, ref) {
  const [active, setActive] = React.useState(0);
  React.useEffect(() => setActive(0), [props.items]);

  const select = (i: number) => {
    const item = props.items[i];
    if (item) props.command({ id: item.id, label: item.label } as unknown as Item);
  };

  React.useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = props.items.length;
      if (n === 0) return false;
      if (event.key === "ArrowDown") { setActive((a) => (a + 1) % n); return true; }
      if (event.key === "ArrowUp") { setActive((a) => (a - 1 + n) % n); return true; }
      if (event.key === "Enter" || event.key === "Tab") { select(active); return true; }
      return false;
    },
  }));

  if (props.items.length === 0) return null;

  return React.createElement(
    "div",
    { role: "listbox", className: "z-50 max-h-60 w-64 overflow-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10" },
    props.items.map((item, i) =>
      React.createElement(
        "button",
        {
          key: item.id,
          type: "button",
          role: "option",
          "aria-selected": i === active,
          onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); select(i); },
          onMouseEnter: () => setActive(i),
          className: cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left", i === active && "bg-accent"),
        },
        React.createElement(UserAvatar, { name: item.user.name, email: item.user.email, image: item.user.image, size: "sm" }),
        React.createElement(
          "span",
          { className: "min-w-0 flex-1" },
          React.createElement("span", { className: "block truncate text-sm" }, item.label),
          React.createElement("span", { className: "block truncate text-xs text-muted-foreground" }, item.user.email),
        ),
      ),
    ),
  );
});

/** Suggestion render lifecycle — a custom popup mounted to body (no tippy). */
function makeMentionRenderer() {
  let component: ReactRenderer<MentionListRef, SuggestionProps<Item>> | null = null;
  let el: HTMLElement | null = null;

  const position = (rect: DOMRect | null | undefined) => {
    if (!el || !rect) return;
    el.style.top = `${rect.bottom + 4}px`;
    el.style.left = `${rect.left}px`;
  };

  return {
    onStart: (props: SuggestionProps<Item>) => {
      component = new ReactRenderer(MentionList, { props, editor: props.editor });
      el = component.element as HTMLElement;
      el.style.position = "fixed";
      el.style.zIndex = "50";
      document.body.appendChild(el);
      position(props.clientRect?.());
    },
    onUpdate: (props: SuggestionProps<Item>) => {
      component?.updateProps(props);
      position(props.clientRect?.());
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === "Escape") {
        el?.remove(); component?.destroy(); component = null; el = null;
        return true;
      }
      return component?.ref?.onKeyDown?.(props) ?? false;
    },
    onExit: () => {
      el?.remove(); component?.destroy(); component = null; el = null;
    },
  };
}

export function createMentionExtension(users: MentionUser[]) {
  return ServioMention.configure({
    HTMLAttributes: { class: "mention" },
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: "@",
      items: ({ query }: { query: string }): Item[] => {
        const q = query.toLowerCase();
        return users
          .filter((u) => (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
          .slice(0, 8)
          .map((u) => ({ id: u.id, label: u.name ?? u.email, user: u }));
      },
      render: makeMentionRenderer,
    },
  });
}
