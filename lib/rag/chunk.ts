// Deterministic text chunker for RAG indexing. Pure (no I/O, no server-only) so
// it's cheap to unit-test and reuse. Targets ~800 tokens (~3200 chars) per chunk
// with ~200 chars of overlap, preferring paragraph then sentence boundaries so a
// chunk rarely splits mid-thought.

export type Chunk = { ord: number; text: string };

export type ChunkOptions = {
  /** Target chunk size in characters (~4 chars/token). Default ~3200 (~800 tokens). */
  chunkChars?: number;
  /** Characters of trailing context repeated at the start of the next chunk. */
  overlapChars?: number;
};

const DEFAULT_CHUNK_CHARS = 3200;
const DEFAULT_OVERLAP_CHARS = 200;

/**
 * Find the best boundary at or before `hardEnd` (but after `min`) to end a chunk:
 * prefer a paragraph break, then a sentence end, then whitespace. Falls back to
 * `hardEnd` when nothing suitable is found (e.g. one giant unbroken token).
 */
function findBreak(text: string, start: number, hardEnd: number): number {
  const min = start + Math.floor((hardEnd - start) * 0.5); // don't create tiny chunks
  const slice = text.slice(start, hardEnd);

  const para = slice.lastIndexOf("\n\n");
  if (para >= 0 && start + para > min) return start + para + 2;

  // Sentence end: . ! ? optionally followed by a quote/paren, then whitespace.
  const sentenceRe = /[.!?]["')\]]?\s/g;
  let sentenceEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(slice)) !== null) {
    const idx = m.index + m[0].length;
    if (start + idx > min) sentenceEnd = idx;
  }
  if (sentenceEnd >= 0) return start + sentenceEnd;

  const ws = slice.lastIndexOf("\n");
  if (ws >= 0 && start + ws > min) return start + ws + 1;
  const sp = slice.lastIndexOf(" ");
  if (sp >= 0 && start + sp > min) return start + sp + 1;

  return hardEnd;
}

/**
 * Split `text` into ordered chunks. Empty / whitespace-only chunks are dropped
 * and `ord` is contiguous over the chunks actually returned.
 */
export function chunkText(text: string, opts?: ChunkOptions): Chunk[] {
  const chunkChars = Math.max(200, opts?.chunkChars ?? DEFAULT_CHUNK_CHARS);
  const overlap = Math.max(0, Math.min(opts?.overlapChars ?? DEFAULT_OVERLAP_CHARS, chunkChars - 1));

  const normalized = (text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const chunks: Chunk[] = [];
  let pos = 0;
  let ord = 0;

  while (pos < normalized.length) {
    const hardEnd = Math.min(pos + chunkChars, normalized.length);
    const end = hardEnd >= normalized.length ? normalized.length : findBreak(normalized, pos, hardEnd);
    const piece = normalized.slice(pos, end).trim();
    if (piece) chunks.push({ ord: ord++, text: piece });

    if (end >= normalized.length) break;
    // Advance, keeping `overlap` chars of context; guard against no forward progress.
    const next = Math.max(pos + 1, end - overlap);
    pos = next;
  }

  return chunks;
}
