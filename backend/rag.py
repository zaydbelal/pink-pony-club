"""Chunking, embedding and retrieval - a direct port of lib/rag.ts."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import List
from uuid import uuid4

from db import (
    ChunkWithEmbedding,
    StoredChunk,
    StoredDocument,
    create_chunks,
    create_document,
    get_chunks_by_unit,
)
from gemini_client import embed_texts
from schemas import RetrievedChunk

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Fixed-size sliding-window chunking - simple and good enough for hackathon-scale documents."""
    cleaned = text.strip()
    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks: List[str] = []
    start = 0
    while start < len(cleaned):
        end = min(start + chunk_size, len(cleaned))
        chunks.append(cleaned[start:end])
        if end == len(cleaned):
            break
        start = end - overlap
    return chunks


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for x, y in zip(a, b):
        dot += x * y
        norm_a += x * x
        norm_b += y * y
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


async def add_document_to_unit(unit_id: str, title: str, source_text: str) -> dict:
    """Chunks, embeds, and persists a reference document for a unit's knowledge base."""
    document_id = str(uuid4())
    pieces = _chunk_text(source_text)
    embeddings = await embed_texts(pieces)

    create_document(
        StoredDocument(
            id=document_id,
            unitId=unit_id,
            title=title,
            sourceText=source_text,
            createdAt=datetime.now(timezone.utc).isoformat(),
        )
    )

    chunks = [
        StoredChunk(
            id=str(uuid4()),
            documentId=document_id,
            unitId=unit_id,
            chunkIndex=i,
            text=text,
            embedding=embeddings[i],
        )
        for i, text in enumerate(pieces)
    ]
    create_chunks(chunks)

    return {"documentId": document_id, "chunkCount": len(chunks)}


async def retrieve_relevant_chunks(unit_id: str, query: str, top_k: int = 5) -> List[RetrievedChunk]:
    """Embeds `query` and returns the top-K most similar chunks stored for this unit, if any."""
    chunks: List[ChunkWithEmbedding] = get_chunks_by_unit(unit_id)
    if not chunks:
        return []

    [query_embedding] = await embed_texts([query])

    scored = [
        RetrievedChunk(
            documentTitle=chunk.documentTitle,
            text=chunk.text,
            similarity=_cosine_similarity(query_embedding, chunk.embedding),
        )
        for chunk in chunks
    ]
    scored.sort(key=lambda c: c.similarity, reverse=True)
    return scored[:top_k]
