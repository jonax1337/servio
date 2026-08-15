import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { retrieveProjectChunks } from "@/lib/rag/retrieve";
import { loadAccessibleProject } from "@/lib/ai-projects";
import type { AiOperation } from "../types";
import { ok, err, str } from "../helpers";

/**
 * Sable Project library operations. The project is taken from `ctx.projectId`
 * (set by the caller from the chat's binding, never the model) — the model only
 * supplies a query or a file id. When a chat isn't bound to a project, the read
 * tools return a helpful "no project in context" result rather than erroring.
 *
 * Access is always re-checked with loadAccessibleProject in run(), so these tools
 * can do exactly what the acting user could do in the project UI — no more.
 */
export const OPERATIONS: AiOperation[] = [
  {
    id: "project.search_files",
    group: "Project",
    kind: "read",
    minRole: "AGENT",
    description:
      "Search this project's uploaded file library for passages relevant to a query and return the best-matching " +
      "snippets with their file names. Use this to ground answers in the project's own documents before replying.",
    input: z.object({ query: z.string().describe("what to look for in the project's files") }),
    run: async (a, ctx) => {
      if (!ctx.projectId) return ok("This chat isn't attached to a project, so there are no project files to search.");
      const query = str(a.query);
      if (!query) return err("A search query is required.");

      // Re-check access — never trust that ctx.projectId is still readable.
      const access = await loadAccessibleProject({ id: ctx.userId, role: ctx.role }, ctx.projectId);
      if (!access) return err("You don't have access to this project.");

      const hits = await retrieveProjectChunks(ctx.projectId, query, 6);
      if (hits.length === 0) return ok(`No matching passages found in the project's files for “${query}”.`);
      return ok(
        `Found ${hits.length} matching passage${hits.length === 1 ? "" : "s"} in the project's files.`,
        { hits: hits.map((h) => ({ fileId: h.fileId, file: h.fileName, snippet: h.text })) },
      );
    },
  },
  {
    id: "project.list_files",
    group: "Project",
    kind: "read",
    minRole: "AGENT",
    description: "List the files and folders in this project's library, so you can see what's available to reference.",
    input: z.object({}),
    run: async (_a, ctx) => {
      if (!ctx.projectId) return ok("This chat isn't attached to a project, so there are no project files to list.");

      const access = await loadAccessibleProject({ id: ctx.userId, role: ctx.role }, ctx.projectId);
      if (!access) return err("You don't have access to this project.");

      const [folders, files] = await Promise.all([
        db.aiProjectFolder.findMany({
          where: { projectId: ctx.projectId },
          orderBy: { name: "asc" },
          select: { id: true, name: true, parentId: true },
        }),
        db.aiProjectFile.findMany({
          where: { projectId: ctx.projectId },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, folderId: true, indexedAt: true },
        }),
      ]);

      return ok(
        `This project has ${files.length} file${files.length === 1 ? "" : "s"} in ${folders.length} folder${folders.length === 1 ? "" : "s"}.`,
        {
          folders: folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId })),
          files: files.map((f) => ({ id: f.id, name: f.name, folderId: f.folderId, indexed: !!f.indexedAt })),
        },
      );
    },
  },
  {
    id: "project.file_delete",
    group: "Project",
    kind: "write",
    minRole: "AGENT",
    description:
      "Delete a file from this project's library (identified by its id, e.g. from project.list_files). " +
      "This removes the file and its retrieval index; it cannot be undone.",
    input: z.object({ fileId: z.string().describe("the project file id to delete") }),
    label: (a) => `Delete project file ${str(a.fileId) ?? ""}`.trim(),
    run: async (a, ctx) => {
      const fileId = str(a.fileId);
      if (!fileId) return err("A file id is required.");

      const file = await db.aiProjectFile.findUnique({
        where: { id: fileId },
        select: { id: true, projectId: true, name: true, attachmentId: true, attachment: { select: { storageKey: true } } },
      });
      if (!file) return err("Project file not found.");

      // Re-check access to the file's project (never trust ctx.projectId here).
      const access = await loadAccessibleProject({ id: ctx.userId, role: ctx.role }, file.projectId);
      if (!access) return err("You don't have access to this project.");

      // Row-first-then-blob: delete the file row (chunks cascade), the attachment row, then the blob.
      await db.aiProjectFile.delete({ where: { id: file.id } });
      const delAtt = await db.attachment.deleteMany({ where: { id: file.attachmentId } });
      if (delAtt.count > 0 && file.attachment?.storageKey) {
        await storage.delete(file.attachment.storageKey).catch(() => {});
      }

      await writeAudit({ userId: ctx.userId, action: "DELETE", entity: "AiProjectFile", entityId: file.id, summary: `Deleted project file "${file.name}" via Sable` });
      return ok(`Deleted project file "${file.name}".`);
    },
  },
];
