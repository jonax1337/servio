// Project-scoped retrieval + indexing for Sable Projects (RAG phase 1). Pure
// server-only helpers (NOT "use server") — safe to import from server actions and
// route handlers. The baseline ranker is a BM25-lite term-overlap scorer computed
// in JS after a bounded query, so it works identically on SQLite (dev) and
// Postgres with no full-text / vector features. A later phase can add an
// embedding tier additively without changing these signatures.
import "server-only";
import { db } from "@/lib/db";
import { chunkText } from "@/lib/rag/chunk";

export type RetrievedChunk = {
  fileId: string;
  fileName: string;
  text: string;
  score: number;
};

/** Cap on chunk rows scanned per retrieval — keeps JS scoring bounded. */
const MAX_ROWS = 2000;
/** BM25 tuning constants. */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** Tokenize to lower-cased word terms, dropping tokens shorter than 3 chars. */
function terms(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

/**
 * Baseline retrieval: rank a project's stored chunks against `query` by BM25-lite
 * term overlap and return the top matches (score > 0). DB-agnostic.
 */
export async function retrieveProjectChunks(
  projectId: string,
  query: string,
  topK = 6,
): Promise<RetrievedChunk[]> {
  const queryTerms = Array.from(new Set(terms(query)));
  if (queryTerms.length === 0) return [];

  const rows = await db.aiProjectChunk.findMany({
    where: { projectId },
    select: { fileId: true, text: true, file: { select: { name: true } } },
    take: MAX_ROWS,
  });
  if (rows.length === 0) return [];

  // Precompute per-chunk term frequencies + corpus stats for BM25.
  const docs = rows.map((r) => {
    const toks = terms(r.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { fileId: r.fileId, fileName: r.file?.name ?? "file", text: r.text, tf, len: toks.length };
  });

  const N = docs.length;
  const avgdl = docs.reduce((s, d) => s + d.len, 0) / N || 1;
  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const t of queryTerms) {
    let c = 0;
    for (const d of docs) if (d.tf.has(t)) c++;
    df.set(t, c);
  }
  // Inverse document frequency (BM25, floored at 0).
  const idf = new Map<string, number>();
  for (const t of queryTerms) {
    const n = df.get(t) ?? 0;
    idf.set(t, Math.max(0, Math.log((N - n + 0.5) / (n + 0.5) + 1)));
  }

  const scored = docs.map((d) => {
    let score = 0;
    for (const t of queryTerms) {
      const f = d.tf.get(t);
      if (!f) continue;
      const w = idf.get(t) ?? 0;
      if (w <= 0) continue;
      const denom = f + BM25_K1 * (1 - BM25_B + BM25_B * (d.len / avgdl));
      score += w * ((f * (BM25_K1 + 1)) / denom);
    }
    return { fileId: d.fileId, fileName: d.fileName, text: d.text, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK));
}

/**
 * (Re)index a single project file: read its extracted text, replace its chunk
 * rows, and stamp `indexedAt`. No-op text still clears stale chunks and marks the
 * file indexed. Safe to call repeatedly.
 */
export async function indexProjectFile(fileId: string): Promise<void> {
  const file = await db.aiProjectFile.findUnique({
    where: { id: fileId },
    select: { id: true, projectId: true, extractedText: true },
  });
  if (!file) return;

  await db.aiProjectChunk.deleteMany({ where: { fileId: file.id } });

  const chunks = chunkText(file.extractedText ?? "");
  if (chunks.length > 0) {
    await db.aiProjectChunk.createMany({
      data: chunks.map((c) => ({
        fileId: file.id,
        projectId: file.projectId,
        ord: c.ord,
        text: c.text,
      })),
    });
  }

  await db.aiProjectFile.update({
    where: { id: file.id },
    data: { indexedAt: new Date() },
  });
}
