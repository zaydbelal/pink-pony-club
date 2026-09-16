import { randomUUID } from "crypto";
import { embedTexts } from "./gemini";
import { createDocument, createChunks, getChunksByUnit, type StoredChunk } from "./db";
import type { RetrievedChunk } from "./schemas";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

/** Fixed-size sliding-window chunking - simple and good enough for hackathon-scale documents. */
function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const cleaned = text.trim();
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Chunks, embeds, and persists a reference document for a unit's knowledge base. */
export async function addDocumentToUnit(
  unitId: string,
  title: string,
  sourceText: string,
): Promise<{ documentId: string; chunkCount: number }> {
  const documentId = randomUUID();
  const pieces = chunkText(sourceText);
  const embeddings = await embedTexts(pieces);

  createDocument({
    id: documentId,
    unitId,
    title,
    sourceText,
    createdAt: new Date().toISOString(),
  });

  const chunks: StoredChunk[] = pieces.map((text, i) => ({
    id: randomUUID(),
    documentId,
    unitId,
    chunkIndex: i,
    text,
    embedding: embeddings[i],
  }));
  createChunks(chunks);

  return { documentId, chunkCount: chunks.length };
}

/** Embeds `query` and returns the top-K most similar chunks stored for this unit, if any. */
export async function retrieveRelevantChunks(
  unitId: string,
  query: string,
  topK = 5,
): Promise<RetrievedChunk[]> {
  const chunks = getChunksByUnit(unitId);
  if (chunks.length === 0) return [];

  const [queryEmbedding] = await embedTexts([query]);

  return chunks
    .map((chunk) => ({
      documentTitle: chunk.documentTitle,
      text: chunk.text,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
