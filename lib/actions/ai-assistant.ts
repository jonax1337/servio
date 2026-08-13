"use server";

import type { ModelMessage } from "ai";
import { db } from "@/lib/db";
import { getCurrentUser, isAgent, hasRole, type Role } from "@/lib/session";
import { aiConfigured, generateAiChat } from "@/lib/ai";
import { getOrgDirectory } from "@/lib/ai-context";
import { getTicketAiContext } from "@/lib/actions/ai";
import { getSetting } from "@/lib/settings";
import { renderMarkdown } from "@/lib/markdown";
import { buildAssistantGeneralTools } from "@/lib/assistant-tools";
import { ASSISTANT_ADMIN_TOOLS } from "@/lib/ai-admin-tools";
import { buildOperationTools, runOperation } from "@/lib/ai-operations/tools";
import { findOperation } from "@/lib/ai-operations/registry";
import { AI_ASSISTANT_NAME, AI_SCOPES } from "@/lib/constants";

/* ────────────────────────────────────────────────────────────────────────────
 * SHARED TYPES — defined once here, imported (type-only) everywhere else.
 * ──────────────────────────────────────────────────────────────────────────── */

export type AssistantScope = "GENERAL" | "ADMIN";

/**
 * An attachment as rendered in the transcript. `dataUrl` is present for images
 * (thumbnail preview). Files show a chip (name/size) with no data.
 */
export type AssistantAttachment = {
  name: string;
  type: string;
  size: number;
  kind: "image" | "file";
  dataUrl?: string;
};

/**
 * An attachment as the client uploads it: a data URL (base64) for every file so
 * the server can feed images to a vision model and extract text from documents.
 */
export type UploadedAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

/** A chat turn as the client holds it (mirrors ChatMessage but with render extras). */
export type AssistantMessage = {
  role: "user" | "assistant";
  content: string;
  html?: string;
  toolCalls?: { name: string; input: unknown }[];
  proposals?: AssistantProposal[];
  attachments?: AssistantAttachment[];
  reasoning?: string; // extended-thinking summary (session-only; not persisted)
  error?: boolean;
};

/**
 * A change Sable proposes via an operation from the RBAC registry
 * (`lib/ai-operations`). Nothing mutates until the human approves the card and
 * applyAssistantProposal re-checks the operation's role + chat scope, re-validates
 * the args against the operation's schema, and runs the real mutation.
 */
export type AssistantProposal = {
  id: string; // stable within a turn (pr0, pr1, …)
  operationId: string; // registry op id, e.g. "category.create"
  args: Record<string, unknown>;
  label: string; // human summary for the approval card
};

/** Return of sendMessage — the assistant turn plus the (now-persisted) ids. */
export type SendMessageResult =
  | {
      ok: true;
      conversationId: string;
      title: string; // possibly newly auto-generated
      message: AssistantMessage; // the assistant turn (role:"assistant")
    }
  | { ok: false; error: string };

/** Left-rail list item. */
export type ConversationSummary = {
  id: string;
  title: string;
  scope: AssistantScope;
  archived: boolean;
  folderId: string | null;
  updatedAt: string; // ISO string (serialized for the client)
};

/** A folder in the left rail. */
export type AiFolderSummary = {
  id: string;
  name: string;
};

/** Full conversation for the active-view (getConversation). */
export type ConversationDetail = {
  id: string;
  title: string;
  scope: AssistantScope;
  archived: boolean;
  messages: AssistantMessage[];
};

export type ApplyResult = { ok: boolean; applied?: string; error?: string };

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Normalise a persisted scope string to the union (defence in depth). */
function coerceScope(raw: string): AssistantScope {
  return raw === "ADMIN" ? "ADMIN" : "GENERAL";
}

/**
 * The acting user with a FRESH role from the DB (not the possibly-stale JWT).
 * The Auth.js JWT freezes role/isActive at login (see lib/session.ts), so a
 * demoted or deactivated user would otherwise keep their old access until the
 * token expires. Every RBAC decision in this file authorises off this, never
 * the session role. Returns null if not signed in, inactive, or below AGENT.
 */
async function actingAgent(): Promise<
  { id: string; name: string; email: string; role: Role } | null
> {
  const row = await getCurrentUser();
  if (!row || !row.isActive || !isAgent(row.role as Role)) return null;
  return {
    id: row.id,
    name: row.name ?? row.email ?? "User",
    email: row.email ?? "",
    role: row.role as Role,
  };
}

/** Serialize an AiMessage row → AssistantMessage (parse the JSON columns). */
function toAssistantMessage(row: {
  role: string;
  content: string;
  html: string | null;
  toolCalls: string | null;
  proposals: string | null;
}): AssistantMessage {
  const msg: AssistantMessage = {
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content ?? "",
  };
  if (row.html) msg.html = row.html;
  if (row.toolCalls) {
    try {
      msg.toolCalls = JSON.parse(row.toolCalls) as { name: string; input: unknown }[];
    } catch {
      /* ignore malformed */
    }
  }
  if (row.proposals) {
    try {
      msg.proposals = JSON.parse(row.proposals) as AssistantProposal[];
    } catch {
      /* ignore malformed */
    }
  }
  return msg;
}

/**
 * Turn Sable's propose_* tool calls into approval cards. Each write tool maps (via
 * writeToolToOpId, built alongside the tools) to a registry operation id; we look
 * up the op to compute the card label. Deduped by operation + args.
 */
function buildAssistantProposals(
  toolCalls: { name: string; input: unknown }[],
  writeToolToOpId: Map<string, string>,
): AssistantProposal[] {
  const out: AssistantProposal[] = [];
  const seen = new Set<string>();
  toolCalls.forEach((tc, i) => {
    const operationId = writeToolToOpId.get(tc.name);
    if (!operationId) return;
    const op = findOperation(operationId);
    if (!op) return;
    const args = (tc.input ?? {}) as Record<string, unknown>;
    const sig = `${operationId}:${JSON.stringify(args)}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({
      id: `pr${i}`,
      operationId,
      args,
      label: op.label ? op.label(args) : operationId,
    });
  });
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Conversation CRUD.
 * ──────────────────────────────────────────────────────────────────────────── */

export async function listConversations(): Promise<ConversationSummary[]> {
  const me = await actingAgent();
  if (!me) return [];
  const admin = hasRole(me.role, "ADMIN");

  const rows = await db.aiConversation.findMany({
    where: { userId: me.id },
    orderBy: [{ archived: "asc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, scope: true, archived: true, folderId: true, updatedAt: true },
  });

  return rows
    .filter((r) => admin || coerceScope(r.scope) !== "ADMIN") // defence in depth
    .map((r) => ({
      id: r.id,
      title: r.title,
      scope: coerceScope(r.scope),
      archived: r.archived,
      folderId: r.folderId,
      updatedAt: r.updatedAt.toISOString(),
    }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Folders — per-user grouping of conversations (left rail).
 * ──────────────────────────────────────────────────────────────────────────── */

export async function listFolders(): Promise<AiFolderSummary[]> {
  const me = await actingAgent();
  if (!me) return [];
  const rows = await db.aiFolder.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return rows;
}

export async function createFolder(
  name?: string,
): Promise<{ ok: true; folder: AiFolderSummary } | { ok: false; error: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const trimmed = String(name ?? "").trim().slice(0, 80) || "New folder";
  const row = await db.aiFolder.create({
    data: { userId: me.id, name: trimmed },
    select: { id: true, name: true },
  });
  return { ok: true, folder: row };
}

export async function renameFolder(
  id: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const row = await db.aiFolder.findUnique({ where: { id }, select: { userId: true } });
  if (!row || row.userId !== me.id) return { ok: false, error: "Not authorised" };
  const trimmed = String(name ?? "").trim().slice(0, 80) || "New folder";
  await db.aiFolder.update({ where: { id }, data: { name: trimmed } });
  return { ok: true };
}

/** Delete a folder. Its conversations are un-grouped (SetNull), never deleted. */
export async function deleteFolder(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const row = await db.aiFolder.findUnique({ where: { id }, select: { userId: true } });
  if (!row || row.userId !== me.id) return { ok: false, error: "Not authorised" };
  await db.aiFolder.delete({ where: { id } });
  return { ok: true };
}

/** Move a conversation into a folder (or out of any folder when folderId is null). */
export async function moveConversation(
  conversationId: string,
  folderId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const conv = await db.aiConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  if (!conv || conv.userId !== me.id) return { ok: false, error: "Not authorised" };

  if (folderId) {
    const folder = await db.aiFolder.findUnique({ where: { id: folderId }, select: { userId: true } });
    if (!folder || folder.userId !== me.id) return { ok: false, error: "Not authorised" };
  }

  await db.aiConversation.update({ where: { id: conversationId }, data: { folderId } });
  return { ok: true };
}

export async function createConversation(
  scope: AssistantScope,
): Promise<
  { ok: true; conversation: ConversationSummary } | { ok: false; error: string }
> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  if (!AI_SCOPES.includes(scope)) return { ok: false, error: "Invalid scope" };
  if (scope === "ADMIN" && !hasRole(me.role, "ADMIN")) {
    return { ok: false, error: "Not authorised" };
  }

  const row = await db.aiConversation.create({
    data: { userId: me.id, scope, title: "New chat" },
    select: { id: true, title: true, scope: true, archived: true, folderId: true, updatedAt: true },
  });

  return {
    ok: true,
    conversation: {
      id: row.id,
      title: row.title,
      scope: coerceScope(row.scope),
      archived: row.archived,
      folderId: row.folderId,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export async function getConversation(
  id: string,
): Promise<
  { ok: true; conversation: ConversationDetail } | { ok: false; error: string }
> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const row = await db.aiConversation.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      scope: true,
      archived: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          content: true,
          html: true,
          toolCalls: true,
          proposals: true,
        },
      },
    },
  });

  if (!row || row.userId !== me.id) return { ok: false, error: "Not authorised" };
  const scope = coerceScope(row.scope);
  if (scope === "ADMIN" && !hasRole(me.role, "ADMIN")) {
    return { ok: false, error: "Not authorised" };
  }

  return {
    ok: true,
    conversation: {
      id: row.id,
      title: row.title,
      scope,
      archived: row.archived,
      messages: row.messages.map(toAssistantMessage),
    },
  };
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const row = await db.aiConversation.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!row || row.userId !== me.id) return { ok: false, error: "Not authorised" };

  const trimmed = String(title ?? "").trim().slice(0, 120);
  await db.aiConversation.update({
    where: { id },
    data: { title: trimmed || "New chat" },
  });
  return { ok: true };
}

export async function archiveConversation(
  id: string,
  archived: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const row = await db.aiConversation.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!row || row.userId !== me.id) return { ok: false, error: "Not authorised" };

  await db.aiConversation.update({ where: { id }, data: { archived: Boolean(archived) } });
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────────
 * System prompts.
 * ──────────────────────────────────────────────────────────────────────────── */

function generalSystemPrompt(input: {
  orgName: string;
  orgDirectory: string;
  meName: string;
  meRole: string;
}): string {
  const { orgName, orgDirectory, meName, meRole } = input;
  return [
    `You are ${AI_ASSISTANT_NAME}, the AI assistant built into ${orgName}, an IT service`,
    "management system. You are an experienced ITSM engineer: knowledgeable, concise,",
    "specific, a real teammate. This is a standalone chat (not tied to one ticket).",
    "",
    "WHO YOU ARE HELPING:",
    `${meName || "An agent"} (role ${meRole}). Treat them as a trusted colleague. When`,
    `they say "we" or "our team", they mean ${orgName}'s IT / support staff, not an end user.`,
    "",
    "CRITICAL: You and this agent ARE the IT / service desk. Never suggest \"contact IT\" or",
    "\"escalate to IT\" — there is no external IT. Name a SPECIFIC team, service owner, or",
    "record from the directory. Be concrete, never generic.",
    "",
    "TOOLS you can call (prefer internal sources over the open web, and cite what you use):",
    "- list_my_tickets: the tickets assigned to THIS agent — their personal work queue. Use it",
    "  whenever they ask about \"my tickets\", \"what am I working on\", \"what's assigned to me\".",
    "- list_team_tickets: open/unassigned tickets in the agent's own team(s) — work they can pick up.",
    "- list_tickets: structured filters (assignee me/unassigned, status, priority, team).",
    "- get_ticket: full details of ONE ticket by ref/number (SLA due dates, requester, latest comments)",
    "  so you can help them actually work it. Look a ticket up before advising on it.",
    "- search_knowledge_base: the org's own how-to / troubleshooting articles. Try this first.",
    "- search_tickets / search_problems / search_changes: free-text search of existing records (incl. comments).",
    "- web_search / fetch_url: the public web, only for facts not documented internally.",
    "",
    "ACTIONS — you have many `propose_*` tools to change the system, scoped to what your role",
    "permits: create/update tickets, add comments, resolve, escalate, link, add tasks, log work;",
    "and create categories, services, assets, locations, and more. Refer to teams / categories",
    "/ users by their real NAMES (the tools resolve names to records). These ONLY PROPOSE: each",
    "surfaces an approval card the human confirms — nothing is applied on its own, so use them",
    "freely. Propose each distinct change EXACTLY ONCE. IMPORTANT: you CANNOT apply anything",
    "yourself. In your reply, say you have PROPOSED the change(s) for approval below. NEVER say a",
    "change is \"done\", \"applied\", \"created\" or \"approved\".",
    "",
    "Keep answers tight; use short markdown (bold, lists, links). Reply in the user's language.",
    "",
    "ORGANISATION DIRECTORY (real teams, services and categories):",
    orgDirectory,
  ].join("\n");
}

function adminSystemPrompt(input: {
  orgName: string;
  orgDirectory: string;
  meName: string;
  meRole: string;
}): string {
  const { orgName, orgDirectory, meName, meRole } = input;
  return [
    `You are ${AI_ASSISTANT_NAME}, the AI assistant built into ${orgName}, an IT service`,
    "management system, now in ADMIN mode: a system-wide setup & management assistant for an",
    `administrator. You help configure, organise and understand the whole ${orgName} instance.`,
    "",
    "WHO YOU ARE HELPING:",
    `${meName || "An administrator"} (role ${meRole}) — a trusted system administrator.`,
    "",
    "WHAT YOU CAN DO:",
    "- PULL STATISTICS with get_statistics. Available metrics: tickets_by_status,",
    "  tickets_by_priority, tickets_by_team, tickets_by_category, open_tickets,",
    "  tickets_created, tickets_resolved, sla_breaches, users_by_role, counts_overview.",
    "  (optional groupBy, timeframeDays). Use it to answer \"how many…\", \"how is X trending\",",
    "  \"which team has the most open tickets\", etc. Report numbers plainly (short tables/lists).",
    "- REVIEW CONFIG with get_settings_overview (shows non-secret settings and whether secrets",
    "  are configured). NEVER reveal or ask for secret values (API keys, passwords, encryption",
    "  keys); you can see only whether they are set, never their contents. Never print a secret.",
    "- LOOK UP people, groups, categories and services (search_people/groups/categories/services),",
    "  and the general read tools (search_knowledge_base, search_tickets/problems/changes, web).",
    "",
    "ACTIONS — in ADMIN mode you have the FULL set of `propose_*` tools: manage tickets, categories,",
    "groups/teams, services, catalog items, assets, locations, SLAs, knowledge articles,",
    "problems, changes, USER ROLES, and app SETTINGS (NON-SECRET keys only — you can never read or",
    "set secrets like API keys / passwords / encryption keys). Refer to records by their real names.",
    "Each ONLY PROPOSES an approval card; nothing is applied on its own. Propose each distinct change",
    "EXACTLY ONCE. IMPORTANT: you CANNOT apply anything yourself. In your reply, say you have PROPOSED",
    "the change(s) for approval below. NEVER say a change is \"done\", \"applied\", \"created\" or \"approved\".",
    "",
    "Be precise and factual; never invent metrics — always call get_statistics for numbers.",
    "Use short markdown. Reply in the user's language.",
    "",
    "ORGANISATION DIRECTORY (real teams, services and categories):",
    orgDirectory,
  ].join("\n");
}

/* ────────────────────────────────────────────────────────────────────────────
 * Attachments — turn uploaded files into multimodal model content.
 * ──────────────────────────────────────────────────────────────────────────── */

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB per file (post-downscale for images)
const MAX_FILE_TEXT_CHARS = 6000; // how much of a text file we inline per file
const MAX_IMAGE_PARTS = 4; // cap images actually sent to the model

/** Text-ish files we can decode and inline verbatim for any model (no vision needed). */
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "log", "yml", "yaml", "xml",
  "html", "htm", "css", "js", "jsx", "ts", "tsx", "py", "java", "sql", "sh",
  "env", "ini", "toml", "conf", "rb", "go", "rs", "php", "c", "cpp", "h",
]);

function isImage(type: string) {
  return type.startsWith("image/");
}
function isTextLike(name: string, type: string) {
  if (type.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/x-yaml", "application/csv"].includes(type)) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

/** Decode the base64 payload of a data URL to a UTF-8 string (server-side). */
function decodeDataUrlText(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Buffer.from(b64, "base64").toString("utf8");
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type BuiltContent = {
  /** Multimodal content parts (text + image/file parts) for a vision-capable model. */
  parts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
    | { type: "file"; data: string; mediaType: string }
  >;
  /** Plain-text-only fallback (for models that can't take images/files). */
  text: string;
  /** Metadata for persistence / transcript re-render. */
  meta: AssistantAttachment[];
  hasBinaryParts: boolean;
};

/**
 * Turn the user's text + uploaded attachments into model content:
 * - images  → image parts (a vision model reads them) + a note
 * - text files → decoded and inlined (works for ANY model)
 * - PDFs   → file parts (Anthropic/OpenAI read them) + a note
 * - other  → a note naming the file so the model can acknowledge it
 * Also returns a text-only fallback used if the model rejects binary parts.
 */
function buildUserContent(text: string, uploads: UploadedAttachment[]): BuiltContent {
  const parts: BuiltContent["parts"] = [];
  const meta: AssistantAttachment[] = [];
  const textBlocks: string[] = text ? [text] : [];
  const notes: string[] = [];
  let imageCount = 0;
  let hasBinaryParts = false;

  for (const a of uploads) {
    if (isImage(a.type)) {
      meta.push({ name: a.name, type: a.type, size: a.size, kind: "image", dataUrl: a.dataUrl });
      notes.push(`- image: ${a.name}`);
      if (imageCount < MAX_IMAGE_PARTS) {
        parts.push({ type: "image", image: a.dataUrl });
        imageCount++;
        hasBinaryParts = true;
      }
    } else if (isTextLike(a.name, a.type)) {
      meta.push({ name: a.name, type: a.type, size: a.size, kind: "file" });
      let body = "";
      try {
        body = decodeDataUrlText(a.dataUrl).slice(0, MAX_FILE_TEXT_CHARS);
      } catch {
        body = "(could not read file)";
      }
      textBlocks.push(
        `\n\n[Attached file: ${a.name} (${a.type || "text"}, ${humanSize(a.size)})]\n"""\n${body}\n"""`,
      );
    } else if (a.type === "application/pdf") {
      meta.push({ name: a.name, type: a.type, size: a.size, kind: "file" });
      notes.push(`- document: ${a.name} (PDF)`);
      parts.push({ type: "file", data: a.dataUrl, mediaType: "application/pdf" });
      hasBinaryParts = true;
    } else {
      meta.push({ name: a.name, type: a.type, size: a.size, kind: "file" });
      notes.push(`- file: ${a.name} (${a.type || "unknown"}) — attached, not machine-readable here`);
    }
  }

  if (notes.length) {
    textBlocks.push(`\n\nThe user attached:\n${notes.join("\n")}`);
  }

  const combinedText = textBlocks.join("").trim() || "(no message)";
  // Prepend the combined text as the first part.
  parts.unshift({ type: "text", text: combinedText });

  return { parts, text: combinedText, meta, hasBinaryParts };
}

/* ────────────────────────────────────────────────────────────────────────────
 * sendMessage — the chat turn.
 * ──────────────────────────────────────────────────────────────────────────── */

export async function sendMessage(input: {
  conversationId: string;
  content: string;
  attachments?: UploadedAttachment[];
  /** In-context surface, e.g. the ticket the user is viewing (from the Sable launcher). */
  context?: { ticketId?: number };
}): Promise<SendMessageResult> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const content = String(input?.content ?? "").trim();

  // Sanitise attachments (bound count + size; drop anything malformed).
  const uploads: UploadedAttachment[] = Array.isArray(input?.attachments)
    ? input.attachments
        .filter(
          (a) =>
            a &&
            typeof a.dataUrl === "string" &&
            a.dataUrl.startsWith("data:") &&
            a.dataUrl.length < MAX_ATTACHMENT_BYTES * 1.4 && // base64 overhead
            typeof a.name === "string",
        )
        .slice(0, MAX_ATTACHMENTS)
        .map((a) => ({
          name: String(a.name).slice(0, 200),
          type: String(a.type ?? ""),
          size: Number.isFinite(a.size) ? Number(a.size) : 0,
          dataUrl: a.dataUrl,
        }))
    : [];

  if (!content && uploads.length === 0) return { ok: false, error: "Nothing to send." };

  const conv = await db.aiConversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, userId: true, scope: true, title: true },
  });
  if (!conv || conv.userId !== me.id) return { ok: false, error: "Not authorised" };

  const scope = coerceScope(conv.scope);
  if (scope === "ADMIN" && !hasRole(me.role, "ADMIN")) {
    return { ok: false, error: "Not authorised" };
  }

  if (!(await aiConfigured())) return { ok: false, error: "AI is not configured." };

  // Turn text + uploads into model content (images/files) + a text-only fallback.
  const built = buildUserContent(content, uploads);

  // What we PERSIST/display is the user's own text (or, if they only sent files,
  // the file names) — clean in the transcript. The verbose combined text (with
  // inlined file contents + notes) is fed to the model this turn only.
  const displayContent =
    content || built.meta.map((m) => m.name).join(", ") || "(attachment)";

  // Persist the user turn first (so the conversation survives an AI failure).
  await db.aiMessage.create({
    data: { conversationId: conv.id, role: "user", content: displayContent },
  });

  // Auto-title from the first user message (before this turn there were none).
  let title = conv.title;
  if (title === "New chat") {
    const seed =
      content.replace(/\s+/g, " ").trim() ||
      (built.meta[0]?.name ? `Re: ${built.meta[0].name}` : "");
    title = seed.slice(0, 60) || "New chat";
    await db.aiConversation.update({ where: { id: conv.id }, data: { title } });
  }

  // Build the model message history from the DB (bounded).
  const rows = await db.aiMessage.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const recent = rows.slice(-16);
  const messages: ModelMessage[] = recent.map((m) =>
    m.role === "assistant"
      ? { role: "assistant", content: m.content }
      : { role: "user", content: m.content },
  );
  // Replace the just-added final user turn with the FULL content for this turn:
  // multimodal parts when there are images/PDFs, otherwise the combined text
  // (which includes any inlined text-file contents). History rows stay clean.
  if (messages.length > 0) {
    messages[messages.length - 1] = built.hasBinaryParts
      ? ({ role: "user", content: built.parts } as ModelMessage)
      : ({ role: "user", content: built.text } as ModelMessage);
  }

  const orgName = (await getSetting("APP_NAME")) || "Servio";
  const orgDirectory = await getOrgDirectory();

  // Tools = READ tools (user-scoped reads + admin read/stats) + the RBAC-gated
  // WRITE operations from the registry (surfaced as propose_* → approval cards).
  // The claude-code path adapts these exact ai-sdk tools into in-process SDK
  // tools, so the subscription backend gets identical reads + proposals.
  const memberships = await db.groupMember.findMany({
    where: { userId: me.id },
    select: { groupId: true },
  });
  const readTools = buildAssistantGeneralTools({
    userId: me.id,
    name: me.name,
    groupIds: memberships.map((m) => m.groupId),
  });
  const adminReadTools = scope === "ADMIN" ? ASSISTANT_ADMIN_TOOLS : {};
  const { tools: opTools, writeToolToOpId } = buildOperationTools(
    { userId: me.id, role: me.role, name: me.name },
    scope,
  );
  const tools = { ...readTools, ...adminReadTools, ...opTools };
  let system =
    scope === "ADMIN"
      ? adminSystemPrompt({ orgName, orgDirectory, meName: me.name, meRole: me.role })
      : generalSystemPrompt({ orgName, orgDirectory, meName: me.name, meRole: me.role });

  // In-context surface: if the user opened Sable on a ticket, inject that ticket so
  // "this ticket", "summarise it", "draft a KB article from it", "tag/resolve it"
  // work without them typing the ref (Sable uses the ref shown below for tools).
  const ctxTicketId = Number(input.context?.ticketId);
  if (Number.isInteger(ctxTicketId) && ctxTicketId > 0) {
    const ticketContext = await getTicketAiContext(ctxTicketId);
    if (ticketContext) {
      system +=
        "\n\nCURRENT TICKET (the user is viewing this — treat \"this ticket\"/\"it\" as this one, and " +
        "use its ref for ticket tools; you may draft a KB article from its problem + resolution):\n" +
        ticketContext;
    }
  }

  // NOTE on "thought process": the Claude subscription CLI backend REDACTS the
  // raw chain-of-thought (thinking blocks come back with an empty `thinking` text
  // + a signature only), so it can't be shown there — forcing thinking would only
  // add latency/cost. The `reasoning` plumbing below stays dormant and lights up
  // automatically on a reasoning-capable ai-sdk provider (Anthropic API key with
  // extended thinking), which returns reasoningText. So we don't force it here.
  const run = (msgs: ModelMessage[]) =>
    generateAiChat({ system, messages: msgs, tools, maxSteps: 10 });

  try {
    let result: Awaited<ReturnType<typeof generateAiChat>>;
    try {
      result = await run(messages);
    } catch (e) {
      // Graceful degradation: local models (e.g. text-only Ollama) and the CLI
      // path can't take image parts — retry once text-only (the combined text
      // already names the attachments).
      if (built.hasBinaryParts) {
        const textOnly = [...messages];
        textOnly[textOnly.length - 1] = { role: "user", content: built.text };
        result = await run(textOnly);
      } else {
        throw e;
      }
    }

    const { text, toolCalls, reasoning } = result;
    const answer = text || "(no answer)";
    const html = renderMarkdown(answer);
    const proposals = buildAssistantProposals(toolCalls, writeToolToOpId);

    await db.aiMessage.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content: answer,
        html,
        toolCalls: JSON.stringify(toolCalls),
        proposals: proposals.length ? JSON.stringify(proposals) : null,
      },
    });
    // Bump updatedAt so the rail re-sorts this conversation to the top.
    await db.aiConversation.update({ where: { id: conv.id }, data: {} });

    return {
      ok: true,
      conversationId: conv.id,
      title,
      message: {
        role: "assistant",
        content: answer,
        html,
        toolCalls,
        proposals,
        reasoning,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * applyAssistantProposal — re-validate EVERYTHING server-side, run real actions.
 * ──────────────────────────────────────────────────────────────────────────── */

export async function applyAssistantProposal(input: {
  conversationId: string;
  proposal: AssistantProposal;
}): Promise<ApplyResult> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const p = input?.proposal;
  if (!p || typeof p !== "object" || typeof p.operationId !== "string") {
    return { ok: false, error: "Bad proposal" };
  }

  // Ownership of the conversation.
  const conv = await db.aiConversation.findUnique({
    where: { id: input.conversationId },
    select: { userId: true, scope: true },
  });
  if (!conv || conv.userId !== me.id) return { ok: false, error: "Not authorised" };

  // Generic dispatch: runOperation re-looks-up the operation, re-checks its
  // minRole against the FRESH DB role (actingAgent), enforces adminOnly against
  // the conversation's scope, re-validates the args against the op's schema
  // (client args are never trusted), then runs the real mutation.
  try {
    const res = await runOperation({
      operationId: p.operationId,
      args: p.args,
      ctx: { userId: me.id, role: me.role, name: me.name },
      scope: coerceScope(conv.scope),
    });
    return res.ok ? { ok: true, applied: res.summary } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not apply the change" };
  }
}
