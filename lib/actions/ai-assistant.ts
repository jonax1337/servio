"use server";

import type { ModelMessage } from "ai";
import { db } from "@/lib/db";
import { getCurrentUser, isAgent, hasRole, type Role } from "@/lib/session";
import { aiConfigured, generateAiChat } from "@/lib/ai";
import { getOrgDirectory, getProjectContext } from "@/lib/ai-context";
import { getTicketAiContext } from "@/lib/actions/ai";
import { getSetting } from "@/lib/settings";
import { renderMarkdown } from "@/lib/markdown";
import { buildAssistantGeneralTools } from "@/lib/assistant-tools";
import { ASSISTANT_ADMIN_TOOLS } from "@/lib/ai-admin-tools";
import { buildOperationTools, runOperation } from "@/lib/ai-operations/tools";
import { findOperation } from "@/lib/ai-operations/registry";
import { AI_ASSISTANT_NAME, AI_SCOPES, ticketRef, problemRef, changeRef } from "@/lib/constants";
import { loadAccessibleProject, canManageProjectRow } from "@/lib/ai-projects";

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
  projectId: string | null;
  updatedAt: string; // ISO string (serialized for the client)
};

/** A folder in the left rail. */
export type AiFolderSummary = {
  id: string;
  name: string;
};

/** A Sable project as shown in the rail / switcher. `role` is the actor's relationship. */
export type ProjectSummary = {
  id: string;
  name: string;
  archived: boolean;
  isShared: boolean;
  groupId: string | null;
  role: "owner" | "member";
  changeId: number | null;
  problemId: number | null;
  ticketId: number | null;
  updatedAt: string; // ISO string
};

/** Full project for the project home pane (getProject). */
export type ProjectDetail = ProjectSummary & {
  description: string | null;
  instructions: string | null;
};

/** A searchable option for the project-links picker (mirrors the ticket LinkPicker). */
export type ProjectLinkOption = { value: string; label: string };
/** A currently-linked record, rendered as a chip. */
export type ProjectLinkRef = { id: number; label: string; href: string };
export type ProjectLinks = {
  current: { ticket: ProjectLinkRef | null; problem: ProjectLinkRef | null; change: ProjectLinkRef | null };
  options: { tickets: ProjectLinkOption[]; problems: ProjectLinkOption[]; changes: ProjectLinkOption[] };
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
    select: { id: true, title: true, scope: true, archived: true, folderId: true, projectId: true, updatedAt: true },
  });

  return rows
    .filter((r) => admin || coerceScope(r.scope) !== "ADMIN") // defence in depth
    .map((r) => ({
      id: r.id,
      title: r.title,
      scope: coerceScope(r.scope),
      archived: r.archived,
      folderId: r.folderId,
      projectId: r.projectId,
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

  // Folders and projects are mutually-exclusive grouping axes — moving a chat into
  // (or out of) a folder clears any project pin, so it never lives in both.
  await db.aiConversation.update({ where: { id: conversationId }, data: { folderId, projectId: null } });
  return { ok: true };
}

export async function createConversation(
  scope: AssistantScope,
  projectId?: string | null,
): Promise<
  { ok: true; conversation: ConversationSummary } | { ok: false; error: string }
> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  if (!AI_SCOPES.includes(scope)) return { ok: false, error: "Invalid scope" };
  if (scope === "ADMIN" && !hasRole(me.role, "ADMIN")) {
    return { ok: false, error: "Not authorised" };
  }

  // If pinned to a project, the actor must be able to access it.
  if (projectId) {
    const p = await loadAccessibleProject(me, projectId);
    if (!p) return { ok: false, error: "Not authorised" };
  }

  const row = await db.aiConversation.create({
    data: { userId: me.id, scope, title: "New chat", projectId: projectId ?? null },
    select: { id: true, title: true, scope: true, archived: true, folderId: true, projectId: true, updatedAt: true },
  });

  return {
    ok: true,
    conversation: {
      id: row.id,
      title: row.title,
      scope: coerceScope(row.scope),
      archived: row.archived,
      folderId: row.folderId,
      projectId: row.projectId,
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

/** Permanently delete a conversation and its messages (owner only). */
export async function deleteConversation(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const row = await db.aiConversation.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!row || row.userId !== me.id) return { ok: false, error: "Not authorised" };

  await db.aiConversation.delete({ where: { id } }); // AiMessage cascades
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Projects — persistent Sable workspaces (conversations + file library +
 * custom instructions + optional ITSM binding). Owner-managed; optionally
 * shared with one team. Access is enforced via lib/ai-projects.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

type ProjectRow = {
  id: string;
  userId: string;
  name: string;
  archived: boolean;
  isShared: boolean;
  groupId: string | null;
  changeId: number | null;
  problemId: number | null;
  ticketId: number | null;
  updatedAt: Date;
};

const PROJECT_SELECT = {
  id: true, userId: true, name: true, archived: true,
  isShared: true, groupId: true, changeId: true, problemId: true, ticketId: true, updatedAt: true,
} as const;

function toProjectSummary(row: ProjectRow, meId: string): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    archived: row.archived,
    isShared: row.isShared,
    groupId: row.groupId,
    role: row.userId === meId ? "owner" : "member",
    changeId: row.changeId,
    problemId: row.problemId,
    ticketId: row.ticketId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** All projects the actor can see: their own + shared projects for their teams. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const me = await actingAgent();
  if (!me) return [];
  const memberships = await db.groupMember.findMany({
    where: { userId: me.id },
    select: { groupId: true },
  });
  const groupIds = memberships.map((m) => m.groupId);
  const rows = await db.aiProject.findMany({
    where: { OR: [{ userId: me.id }, { isShared: true, groupId: { in: groupIds } }] },
    orderBy: [{ archived: "asc" }, { updatedAt: "desc" }],
    select: PROJECT_SELECT,
  });
  return rows.map((r) => toProjectSummary(r, me.id));
}

export async function getProject(
  id: string,
): Promise<{ ok: true; project: ProjectDetail } | { ok: false; error: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const row = await db.aiProject.findUnique({
    where: { id },
    select: { ...PROJECT_SELECT, description: true, instructions: true },
  });
  if (!row) return { ok: false, error: "Not found" };
  const access = await loadAccessibleProject(me, id);
  if (!access) return { ok: false, error: "Not authorised" };
  return {
    ok: true,
    project: {
      ...toProjectSummary(row, me.id),
      description: row.description,
      instructions: row.instructions,
    },
  };
}

export async function createProject(
  name?: string,
): Promise<{ ok: true; project: ProjectSummary } | { ok: false; error: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const trimmed = String(name ?? "").trim().slice(0, 80) || "New project";
  const row = await db.aiProject.create({
    data: { userId: me.id, name: trimmed },
    select: PROJECT_SELECT,
  });
  return { ok: true, project: toProjectSummary(row, me.id) };
}

/** Guard: the actor owns the project (manage rights). Returns the row or an error. */
async function requireManagedProject(
  meId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.aiProject.findUnique({
    where: { id },
    select: { userId: true, isShared: true, groupId: true },
  });
  if (!row) return { ok: false, error: "Not found" };
  if (!canManageProjectRow({ id: meId, role: "AGENT" }, row)) return { ok: false, error: "Not authorised" };
  return { ok: true };
}

export async function renameProject(id: string, name: string): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const guard = await requireManagedProject(me.id, id);
  if (!guard.ok) return guard;
  const trimmed = String(name ?? "").trim().slice(0, 80) || "New project";
  await db.aiProject.update({ where: { id }, data: { name: trimmed } });
  return { ok: true };
}

export async function updateProjectInstructions(
  id: string,
  instructions: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const guard = await requireManagedProject(me.id, id);
  if (!guard.ok) return guard;
  const trimmed = String(instructions ?? "").slice(0, 4000);
  await db.aiProject.update({ where: { id }, data: { instructions: trimmed || null } });
  return { ok: true };
}

/**
 * Bind the project to an ITSM entity (Change / Problem / Ticket). Pass a value to
 * set, `null` to clear that binding, or omit a key to leave it unchanged. Each id
 * is verified to exist before it is stored.
 */
export async function updateProjectBinding(
  id: string,
  binding: { changeId?: number | null; problemId?: number | null; ticketId?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const guard = await requireManagedProject(me.id, id);
  if (!guard.ok) return guard;

  const data: { changeId?: number | null; problemId?: number | null; ticketId?: number | null } = {};

  if ("changeId" in binding) {
    const v = binding.changeId;
    if (v == null) data.changeId = null;
    else {
      const exists = await db.change.findUnique({ where: { id: Number(v) }, select: { id: true } });
      if (!exists) return { ok: false, error: "Change not found" };
      data.changeId = Number(v);
    }
  }
  if ("problemId" in binding) {
    const v = binding.problemId;
    if (v == null) data.problemId = null;
    else {
      const exists = await db.problem.findUnique({ where: { id: Number(v) }, select: { id: true } });
      if (!exists) return { ok: false, error: "Problem not found" };
      data.problemId = Number(v);
    }
  }
  if ("ticketId" in binding) {
    const v = binding.ticketId;
    if (v == null) data.ticketId = null;
    else {
      const exists = await db.ticket.findUnique({ where: { id: Number(v) }, select: { id: true } });
      if (!exists) return { ok: false, error: "Ticket not found" };
      data.ticketId = Number(v);
    }
  }

  await db.aiProject.update({ where: { id }, data });
  return { ok: true };
}

/**
 * Share (or un-share) the project with one team. Sharing requires the owner to be
 * a member of that team. Clearing (isShared=false) leaves the groupId untouched
 * but hides it from members.
 */
export async function shareProject(
  id: string,
  input: { isShared: boolean; groupId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const guard = await requireManagedProject(me.id, id);
  if (!guard.ok) return guard;

  if (input.isShared) {
    const groupId = input.groupId ?? null;
    if (!groupId) return { ok: false, error: "Pick a team to share with" };
    const member = await db.groupMember.findFirst({
      where: { userId: me.id, groupId },
      select: { userId: true },
    });
    if (!member) return { ok: false, error: "You are not a member of that team" };
    await db.aiProject.update({ where: { id }, data: { isShared: true, groupId } });
  } else {
    await db.aiProject.update({ where: { id }, data: { isShared: false } });
  }
  return { ok: true };
}

/** The actor's teams — used to populate the project Share picker (owner shares with one team). */
export type TeamSummary = { id: string; name: string };

export async function listMyTeams(): Promise<TeamSummary[]> {
  const me = await actingAgent();
  if (!me) return [];
  const rows = await db.groupMember.findMany({
    where: { userId: me.id },
    orderBy: { group: { name: "asc" } },
    select: { group: { select: { id: true, name: true } } },
  });
  return rows.map((r) => ({ id: r.group.id, name: r.group.name }));
}

/** Delete a project. Files + folders cascade; conversations are un-pinned (SetNull). */
export async function deleteProject(id: string): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const guard = await requireManagedProject(me.id, id);
  if (!guard.ok) return guard;
  await db.aiProject.delete({ where: { id } });
  return { ok: true };
}

/** Archive or restore a project (owner only). Archived projects hide from the rail. */
export async function archiveProject(id: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const guard = await requireManagedProject(me.id, id);
  if (!guard.ok) return guard;
  await db.aiProject.update({ where: { id }, data: { archived: Boolean(archived) } });
  return { ok: true };
}

/** Pin one of the actor's own conversations to a project (or unpin when null). */
export async function moveConversationToProject(
  conversationId: string,
  projectId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const conv = await db.aiConversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  if (!conv || conv.userId !== me.id) return { ok: false, error: "Not authorised" };

  if (projectId) {
    const access = await loadAccessibleProject(me, projectId);
    if (!access) return { ok: false, error: "Not authorised" };
  }

  // Pinning to a project clears any folder — a chat belongs to one grouping (project
  // or folder), mirroring how moveConversation clears the project.
  await db.aiConversation.update({ where: { id: conversationId }, data: { projectId, folderId: null } });
  return { ok: true };
}

/**
 * Options + current links for the project-links picker — the same shape the ticket
 * page feeds its LinkPicker (searchable Combobox over a bounded, recent list).
 */
export async function getProjectLinks(
  projectId: string,
): Promise<{ ok: true; links: ProjectLinks } | { ok: false; error: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  const p = await db.aiProject.findUnique({
    where: { id: projectId },
    select: { ticketId: true, problemId: true, changeId: true },
  });
  if (!p) return { ok: false, error: "Not found" };

  // Option lists mirror the ticket page's LinkPicker exactly: active records only,
  // agent-readable (Servio has no per-agent ticket/problem/change visibility — this
  // action is already AGENT+ and project-access gated, and returns the same data the
  // caller can read on /tickets etc.). No per-tenant scoping exists in this app.
  const [tickets, problems, changes, curTicket, curProblem, curChange] = await Promise.all([
    db.ticket.findMany({ where: { status: { notIn: ["CLOSED", "CANCELLED"] } }, orderBy: { updatedAt: "desc" }, take: 60, select: { id: true, title: true, prefix: true } }),
    db.problem.findMany({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true } }),
    db.change.findMany({ where: { status: { notIn: ["CLOSED", "REJECTED", "FAILED"] } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true } }),
    p.ticketId ? db.ticket.findUnique({ where: { id: p.ticketId }, select: { id: true, title: true, prefix: true } }) : Promise.resolve(null),
    p.problemId ? db.problem.findUnique({ where: { id: p.problemId }, select: { id: true, title: true } }) : Promise.resolve(null),
    p.changeId ? db.change.findUnique({ where: { id: p.changeId }, select: { id: true, title: true } }) : Promise.resolve(null),
  ]);

  return {
    ok: true,
    links: {
      current: {
        ticket: curTicket ? { id: curTicket.id, label: `${ticketRef(curTicket.id, curTicket.prefix)} · ${curTicket.title}`, href: `/tickets/${curTicket.id}` } : null,
        problem: curProblem ? { id: curProblem.id, label: `${problemRef(curProblem.id)} · ${curProblem.title}`, href: `/problems/${curProblem.id}` } : null,
        change: curChange ? { id: curChange.id, label: `${changeRef(curChange.id)} · ${curChange.title}`, href: `/changes/${curChange.id}` } : null,
      },
      options: {
        tickets: tickets.map((t) => ({ value: String(t.id), label: `${ticketRef(t.id, t.prefix)} · ${t.title}` })),
        problems: problems.map((pr) => ({ value: String(pr.id), label: `${problemRef(pr.id)} · ${pr.title}` })),
        changes: changes.map((c) => ({ value: String(c.id), label: `${changeRef(c.id)} · ${c.title}` })),
      },
    },
  };
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
    "- draft_document: for a LONG document (a runbook, RCA, change doc, or KB draft) call this with the",
    "  full markdown to open an editable canvas beside the chat where the user can refine and publish it.",
    "  When the user asks for a SCRIPT or a file, call draft_document (pass `filename`/`language`, e.g.",
    "  'deploy.sh'/'bash') to open that editable canvas, which the user can then save into the project's files.",
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

/**
 * Admin capabilities block, APPENDED to the general prompt when the acting user
 * is an ADMIN (rather than swapping to a separate admin-only prompt that would
 * hide the general guidance). Mirrors adminSystemPromptSection in assistant-core.ts.
 */
function adminSystemPromptSection(): string {
  return [
    "",
    "ADMIN CAPABILITIES (you are talking to a system administrator — these are also available):",
    "- PULL STATISTICS with get_statistics. Available metrics: tickets_by_status,",
    "  tickets_by_priority, tickets_by_team, tickets_by_category, open_tickets,",
    "  tickets_created, tickets_resolved, sla_breaches, users_by_role, counts_overview.",
    "  (optional groupBy, timeframeDays). Use it to answer \"how many…\", \"how is X trending\",",
    "  \"which team has the most open tickets\", etc. Report numbers plainly (short tables/lists).",
    "  Never invent metrics — always call get_statistics for numbers.",
    "- REVIEW CONFIG with get_settings_overview (shows non-secret settings and whether secrets",
    "  are configured). NEVER reveal or ask for secret values (API keys, passwords, encryption",
    "  keys); you can see only whether they are set, never their contents. Never print a secret.",
    "- LOOK UP people, groups, categories and services (search_people/groups/categories/services).",
    "- SYSTEM-WIDE `propose_*` ACTIONS: manage groups/teams, services, catalog items, SLAs,",
    "  problems, changes, USER ROLES, and app SETTINGS (NON-SECRET keys only — you can never read",
    "  or set secrets like API keys / passwords / encryption keys). These follow the same",
    "  propose-then-approve rule as every other action.",
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
  context?: { ticketId?: number; projectId?: string };
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
  // Admin read tools + system-wide config ops are gated by the acting user's
  // ROLE (fresh from the DB), not by a separate chat scope — so an admin sees
  // admin capabilities directly in the normal chat; a non-admin never does.
  const isAdmin = hasRole(me.role, "ADMIN");
  const adminReadTools = isAdmin ? ASSISTANT_ADMIN_TOOLS : {};

  // If the chat is pinned to a project the acting user can access, thread its id
  // into the op ctx so project.search_files/list_files resolve to that library.
  let projectId: string | undefined;
  const rawProjectId = typeof input.context?.projectId === "string" ? input.context.projectId : "";
  if (rawProjectId) {
    const access = await loadAccessibleProject({ id: me.id, role: me.role }, rawProjectId);
    if (access) projectId = rawProjectId;
  }

  const { tools: opTools, writeToolToOpId } = buildOperationTools(
    { userId: me.id, role: me.role, name: me.name, projectId },
    scope,
  );
  const tools = { ...readTools, ...adminReadTools, ...opTools };
  // Always the general prompt; for admins, APPEND the admin capabilities block
  // (rather than swapping to an admin-only prompt that hides general guidance).
  let system = generalSystemPrompt({ orgName, orgDirectory, meName: me.name, meRole: me.role });
  if (isAdmin) system += "\n" + adminSystemPromptSection();

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

  // If the chat is pinned to a project, append its context so the model grounds
  // answers in the project's instructions, bound records, and files.
  if (projectId) {
    const projectContext = await getProjectContext(projectId, me.id);
    if (projectContext) {
      system +=
        "\n\nCURRENT PROJECT (this chat is pinned to it — honour its INSTRUCTIONS, treat its " +
        "BOUND RECORDS as the subject, and call project.search_files to ground answers in its files " +
        "rather than guessing):\n" +
        projectContext;
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
    select: { userId: true, scope: true, projectId: true },
  });
  if (!conv || conv.userId !== me.id) return { ok: false, error: "Not authorised" };

  // If the conversation is bound to a project the acting user can still access,
  // thread its id so project ops (e.g. project.file_delete) target the right library.
  let projectId: string | undefined;
  if (conv.projectId) {
    const access = await loadAccessibleProject({ id: me.id, role: me.role }, conv.projectId);
    if (access) projectId = conv.projectId;
  }

  // Generic dispatch: runOperation re-looks-up the operation, re-checks its
  // minRole against the FRESH DB role (actingAgent), enforces adminOnly against
  // the conversation's scope, re-validates the args against the op's schema
  // (client args are never trusted), then runs the real mutation.
  try {
    const res = await runOperation({
      operationId: p.operationId,
      args: p.args,
      ctx: { userId: me.id, role: me.role, name: me.name, projectId },
      scope: coerceScope(conv.scope),
    });
    return res.ok ? { ok: true, applied: res.summary } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not apply the change" };
  }
}
