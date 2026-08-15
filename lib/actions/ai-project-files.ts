"use server";

// Server actions for the Sable Project file library: browse the folder tree,
// organise folders, and move / delete files. Bytes live in blob storage via the
// linked Attachment (lib/storage.ts); these rows add project structure. Every
// mutation is gated by loadAccessibleProject (owner or shared-team member) — the
// same access model as the rest of Sable Projects. Blobs are never deleted when a
// folder is removed (children + files are SetNull, per the schema); an explicit
// file delete removes the row first, then the blob (row-first-then-blob).
import { db } from "@/lib/db";
import { getCurrentUser, isAgent, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { storage, buildStorageKey } from "@/lib/storage";
import { sanitizeFilename } from "@/lib/files";
import { loadAccessibleProject, type ProjectActor } from "@/lib/ai-projects";
import { classifyFile } from "@/lib/ai-file-tag";
import { extractText } from "@/lib/rag/extract";
import { indexProjectFile } from "@/lib/rag/retrieve";

/** A folder node in a project's library tree. */
export type ProjectFolderSummary = {
  id: string;
  name: string;
  parentId: string | null;
};

/** A file in a project's library (blob metadata resolved from its Attachment). */
export type ProjectFileSummary = {
  id: string;
  /** The blob's Attachment id — used for the /api/files/[id] URL (preview/download). */
  attachmentId: string;
  name: string;
  folderId: string | null;
  mime: string;
  size: number;
  indexedAt: string | null;
  tag: string | null;
};

/** The acting agent, resolved fresh from the DB (never a stale JWT). */
async function actingAgent(): Promise<ProjectActor | null> {
  const row = await getCurrentUser();
  if (!row || !row.isActive || !isAgent(row.role as Role)) return null;
  return { id: row.id, role: row.role as Role };
}

/** Resolve the project a folder belongs to, or null. */
async function folderProjectId(folderId: string): Promise<string | null> {
  const f = await db.aiProjectFolder.findUnique({ where: { id: folderId }, select: { projectId: true } });
  return f?.projectId ?? null;
}

/** Resolve the project a file belongs to, or null. */
async function fileProjectId(fileId: string): Promise<string | null> {
  const f = await db.aiProjectFile.findUnique({ where: { id: fileId }, select: { projectId: true } });
  return f?.projectId ?? null;
}

/**
 * List a project's folder tree + files. Access-checked: returns empty on missing
 * or denied (no existence oracle). Files carry their blob mime/size + indexedAt.
 */
export async function listProjectFiles(
  projectId: string,
): Promise<{ folders: ProjectFolderSummary[]; files: ProjectFileSummary[] }> {
  const me = await actingAgent();
  if (!me) return { folders: [], files: [] };
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { folders: [], files: [] };

  const [folders, files] = await Promise.all([
    db.aiProjectFolder.findMany({
      where: { projectId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, parentId: true },
    }),
    db.aiProjectFile.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        attachmentId: true,
        name: true,
        folderId: true,
        indexedAt: true,
        tag: true,
        attachment: { select: { mime: true, size: true } },
      },
    }),
  ]);

  return {
    folders,
    files: files.map((f) => ({
      id: f.id,
      attachmentId: f.attachmentId,
      name: f.name,
      folderId: f.folderId,
      mime: f.attachment?.mime ?? "application/octet-stream",
      size: f.attachment?.size ?? 0,
      indexedAt: f.indexedAt ? f.indexedAt.toISOString() : null,
      tag: f.tag ?? null,
    })),
  };
}

/**
 * Backfill content tags: (re)classify every file in the project that has no tag
 * yet (e.g. uploaded before tagging existed). Access-checked on the project.
 * Classifies from name/mime + the already-extracted text; returns how many files
 * were tagged. Failures per-file are swallowed so a bad file never aborts the run.
 */
export async function retagProjectFiles(
  projectId: string,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  const files = await db.aiProjectFile.findMany({
    where: { projectId, OR: [{ tag: null }, { tag: "" }] },
    select: {
      id: true,
      name: true,
      extractedText: true,
      attachment: { select: { mime: true } },
    },
  });

  let count = 0;
  for (const f of files) {
    try {
      const tag = await classifyFile({
        name: f.name,
        mime: f.attachment?.mime ?? "application/octet-stream",
        text: f.extractedText,
      });
      await db.aiProjectFile.update({ where: { id: f.id }, data: { tag } });
      count++;
    } catch {
      // swallow — skip this file, keep backfilling the rest
    }
  }

  if (count > 0) {
    await writeAudit({
      userId: me.id,
      action: "UPDATE",
      entity: "AiProject",
      entityId: projectId,
      summary: `Classified ${count} project file${count === 1 ? "" : "s"}`,
    });
  }
  return { ok: true, count };
}

/**
 * Infer a canonical text MIME from a file extension (or a language hint). Used
 * for server-generated artifacts (Sable canvas "Save to project"), where the
 * content is already sanitised/trusted text — we don't run it through the
 * upload allow-list (validateUpload has no markdown/script entries and would
 * reject most script extensions). Everything unknown degrades to text/plain.
 */
function artifactMime(name: string, language?: string | null): string {
  const ext = (() => {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  })();
  const byExt: Record<string, string> = {
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    log: "text/plain",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    toml: "text/x-toml",
    ini: "text/plain",
    sh: "application/x-sh",
    bash: "application/x-sh",
    ps1: "application/x-powershell",
    bat: "text/plain",
    cmd: "text/plain",
    dockerfile: "text/plain",
    py: "text/x-python",
    rb: "text/x-ruby",
    go: "text/x-go",
    rs: "text/x-rust",
    java: "text/x-java-source",
    c: "text/x-c",
    h: "text/x-c",
    cpp: "text/x-c++",
    cc: "text/x-c++",
    cxx: "text/x-c++",
    hpp: "text/x-c++",
    js: "text/javascript",
    mjs: "text/javascript",
    cjs: "text/javascript",
    ts: "application/typescript",
    tsx: "application/typescript",
    sql: "application/sql",
    css: "text/css",
    html: "text/html",
    htm: "text/html",
  };
  if (ext && byExt[ext]) return byExt[ext];
  const byLang: Record<string, string> = {
    bash: "application/x-sh",
    sh: "application/x-sh",
    shell: "application/x-sh",
    python: "text/x-python",
    py: "text/x-python",
    ruby: "text/x-ruby",
    go: "text/x-go",
    rust: "text/x-rust",
    java: "text/x-java-source",
    c: "text/x-c",
    "c++": "text/x-c++",
    cpp: "text/x-c++",
    javascript: "text/javascript",
    js: "text/javascript",
    typescript: "application/typescript",
    ts: "application/typescript",
    sql: "application/sql",
    json: "application/json",
    yaml: "application/x-yaml",
    xml: "application/xml",
    markdown: "text/markdown",
    md: "text/markdown",
  };
  const lang = (language ?? "").trim().toLowerCase();
  if (lang && byLang[lang]) return byLang[lang];
  return "text/plain";
}

/**
 * Save a Sable-generated ARTIFACT (a drafted document or script from the canvas)
 * into a project's file library as a real file — so it shows up in Files and is
 * retrievable like any upload. The content is server-trusted text (already
 * authored/sanitised in the editor), so it BYPASSES the upload allow-list
 * (validateUpload has no markdown/script entries); we only sanitise the name and
 * infer a text MIME. Mirrors the upload route's create-then-index ladder with the
 * same rollback invariants (blob delete on Attachment failure; Attachment +
 * blob delete on AiProjectFile failure). Access-checked via loadAccessibleProject.
 */
export async function saveArtifactToProject(
  projectId: string,
  input: { name: string; content: string; mime?: string; folderId?: string | null },
): Promise<{ ok: true; file: ProjectFileSummary } | { ok: false; error: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  const content = String(input.content ?? "");
  if (!content.trim()) return { ok: false, error: "Nothing to save" };

  // The destination folder (if any) must belong to the same project.
  const folderId = input.folderId ?? null;
  if (folderId) {
    const pid = await folderProjectId(folderId);
    if (pid !== projectId) return { ok: false, error: "Not found" };
  }

  const safeName = sanitizeFilename(input.name || "artifact.md");
  const mime = input.mime?.trim() || artifactMime(safeName);
  const buf = Buffer.from(content, "utf8");

  // Store the blob (server-generated, unguessable, traversal-free key).
  const key = buildStorageKey(safeName);
  let stored;
  try {
    stored = await storage.put(key, buf);
  } catch {
    return { ok: false, error: "Could not store the file" };
  }
  const { size, checksum } = stored;

  // Attachment row — roll back the blob on failure.
  let att;
  try {
    att = await db.attachment.create({
      data: { filename: safeName, storageKey: key, mime, size, checksum, uploadedById: me.id },
      select: { id: true },
    });
  } catch {
    await storage.delete(key).catch(() => {});
    return { ok: false, error: "Could not store the file" };
  }

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Attachment", entityId: att.id, summary: `Saved artifact "${safeName}"` });

  // Join row — roll back the attachment + blob on failure so no orphan remains.
  let projFile;
  try {
    projFile = await db.aiProjectFile.create({
      data: { projectId, folderId, attachmentId: att.id, name: safeName },
      select: { id: true },
    });
  } catch {
    await db.attachment.deleteMany({ where: { id: att.id } }).catch(() => {});
    await storage.delete(key).catch(() => {});
    return { ok: false, error: "Could not save the file to the project" };
  }

  // Best-effort extract + index for retrieval (never fail the save).
  let extracted = "";
  try {
    extracted = await extractText(buf, mime, safeName);
    await db.aiProjectFile.update({ where: { id: projFile.id }, data: { extractedText: extracted } });
    await indexProjectFile(projFile.id);
  } catch {
    // swallow — retrieval degrades gracefully
  }

  // Best-effort content tag (never fail the save).
  let tag: string | null = null;
  try {
    tag = await classifyFile({ name: safeName, mime, text: extracted });
    await db.aiProjectFile.update({ where: { id: projFile.id }, data: { tag } });
  } catch {
    // swallow — tagging is non-essential
  }

  await writeAudit({ userId: me.id, action: "CREATE", entity: "AiProjectFile", entityId: projFile.id, summary: `Saved artifact "${safeName}" to project` });

  return {
    ok: true,
    file: {
      id: projFile.id,
      attachmentId: att.id,
      name: safeName,
      folderId,
      mime,
      size,
      indexedAt: null,
      tag,
    },
  };
}

/** Create a folder (optionally nested under parentId). Access-checked on the project. */
export async function createProjectFolder(
  projectId: string,
  parentId?: string | null,
  name?: string,
): Promise<{ ok: true; folder: ProjectFolderSummary } | { ok: false; error: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  // A nested parent must belong to the same project.
  const parent = parentId ?? null;
  if (parent) {
    const pid = await folderProjectId(parent);
    if (pid !== projectId) return { ok: false, error: "Not found" };
  }

  const trimmed = String(name ?? "").trim().slice(0, 80) || "New folder";
  const row = await db.aiProjectFolder.create({
    data: { projectId, parentId: parent, name: trimmed },
    select: { id: true, name: true, parentId: true },
  });
  await writeAudit({ userId: me.id, action: "CREATE", entity: "AiProjectFolder", entityId: row.id, summary: `Created project folder "${trimmed}"` });
  return { ok: true, folder: row };
}

/** Rename a folder. Access-checked via its parent project. */
export async function renameProjectFolder(
  id: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const projectId = await folderProjectId(id);
  if (!projectId) return { ok: false, error: "Not found" };
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  const trimmed = String(name ?? "").trim().slice(0, 80);
  if (!trimmed) return { ok: false, error: "Name is required" };
  await db.aiProjectFolder.update({ where: { id }, data: { name: trimmed } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "AiProjectFolder", entityId: id, summary: `Renamed project folder to "${trimmed}"` });
  return { ok: true };
}

/**
 * Delete a folder. By default its child folders + files are detached (SetNull per
 * the schema) → they move to the project root; nothing is removed. When
 * `deleteFiles` is true, the WHOLE subtree is removed instead: the folder + all its
 * descendant folders + every file within (rows, Attachments and blobs).
 * Access-checked via the parent project.
 */
export async function deleteProjectFolder(
  id: string,
  deleteFiles = false,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const projectId = await folderProjectId(id);
  if (!projectId) return { ok: true }; // idempotent
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  if (deleteFiles) {
    // Collect this folder + every descendant folder (BFS over parentId).
    const all = await db.aiProjectFolder.findMany({ where: { projectId }, select: { id: true, parentId: true } });
    const childrenOf = new Map<string, string[]>();
    for (const f of all) {
      const key = f.parentId ?? "";
      (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(f.id);
    }
    const subtree: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      subtree.push(cur);
      for (const c of childrenOf.get(cur) ?? []) stack.push(c);
    }

    // Delete every file in the subtree — row first, then Attachment row, then blob.
    const files = await db.aiProjectFile.findMany({
      where: { folderId: { in: subtree } },
      select: { id: true, attachmentId: true, attachment: { select: { storageKey: true } } },
    });
    for (const file of files) {
      await db.aiProjectFile.delete({ where: { id: file.id } });
      const delAtt = await db.attachment.deleteMany({ where: { id: file.attachmentId } });
      if (delAtt.count > 0 && file.attachment?.storageKey) {
        await storage.delete(file.attachment.storageKey).catch(() => {});
      }
    }

    await db.aiProjectFolder.deleteMany({ where: { id: { in: subtree } } });
    await writeAudit({
      userId: me.id,
      action: "DELETE",
      entity: "AiProjectFolder",
      entityId: id,
      summary: `Deleted a project folder + ${files.length} file${files.length === 1 ? "" : "s"}`,
    });
    return { ok: true };
  }

  await db.aiProjectFolder.delete({ where: { id } });
  await writeAudit({ userId: me.id, action: "DELETE", entity: "AiProjectFolder", entityId: id, summary: "Deleted a project folder" });
  return { ok: true };
}

/** Move a file to another folder (or the project root, folderId=null). Access-checked. */
export async function moveProjectFile(
  fileId: string,
  folderId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  const projectId = await fileProjectId(fileId);
  if (!projectId) return { ok: false, error: "Not found" };
  const access = await loadAccessibleProject(me, projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  // The destination folder must belong to the same project.
  if (folderId) {
    const pid = await folderProjectId(folderId);
    if (pid !== projectId) return { ok: false, error: "Not found" };
  }

  await db.aiProjectFile.update({ where: { id: fileId }, data: { folderId: folderId ?? null } });
  return { ok: true };
}

/** Move several files at once (bulk). Access-checked per file; returns how many moved. */
export async function moveProjectFiles(
  fileIds: string[],
  folderId: string | null,
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  let count = 0;
  for (const id of fileIds) {
    const projectId = await fileProjectId(id);
    if (!projectId) continue;
    if (!(await loadAccessibleProject(me, projectId))) continue;
    if (folderId) {
      const pid = await folderProjectId(folderId);
      if (pid !== projectId) continue;
    }
    await db.aiProjectFile.update({ where: { id }, data: { folderId: folderId ?? null } });
    count++;
  }
  return { ok: true, count };
}

/** Delete several files at once (bulk). Access-checked per file; row → attachment → blob. */
export async function deleteProjectFiles(
  fileIds: string[],
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  let count = 0;
  for (const id of fileIds) {
    const file = await db.aiProjectFile.findUnique({
      where: { id },
      select: { id: true, projectId: true, attachmentId: true, attachment: { select: { storageKey: true } } },
    });
    if (!file) continue;
    if (!(await loadAccessibleProject(me, file.projectId))) continue;
    await db.aiProjectFile.delete({ where: { id: file.id } });
    const delAtt = await db.attachment.deleteMany({ where: { id: file.attachmentId } });
    if (delAtt.count > 0 && file.attachment?.storageKey) {
      await storage.delete(file.attachment.storageKey).catch(() => {});
    }
    count++;
  }
  return { ok: true, count };
}

/**
 * Delete a project file: remove the AiProjectFile row (which cascade-deletes its
 * retrieval chunks) first, then delete the underlying Attachment row + its blob —
 * row-first-then-blob, so a failed delete never leaves a row pointing at no blob.
 * Access-checked via the parent project.
 */
export async function deleteProjectFile(fileId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await actingAgent();
  if (!me) return { ok: false, error: "Not authorised" };

  const file = await db.aiProjectFile.findUnique({
    where: { id: fileId },
    select: { id: true, projectId: true, name: true, attachmentId: true, attachment: { select: { storageKey: true } } },
  });
  if (!file) return { ok: true }; // idempotent
  const access = await loadAccessibleProject(me, file.projectId);
  if (!access) return { ok: false, error: "Not authorised" };

  // Row-first: delete the file row (chunks cascade), then the attachment row, then the blob.
  await db.aiProjectFile.delete({ where: { id: file.id } });
  const delAtt = await db.attachment.deleteMany({ where: { id: file.attachmentId } });
  if (delAtt.count > 0 && file.attachment?.storageKey) {
    await storage.delete(file.attachment.storageKey).catch(() => {});
  }

  await writeAudit({ userId: me.id, action: "DELETE", entity: "AiProjectFile", entityId: fileId, summary: `Deleted project file "${file.name}"` });
  return { ok: true };
}
