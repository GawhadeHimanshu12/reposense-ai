from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any


_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{1,}|[A-Za-z0-9]{2,}")


@dataclass(frozen=True)
class RetrievedChunk:
    path: str
    content: str
    score: float


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in _TOKEN_RE.findall(text)]


def _chunk_text(path: str, content: str, max_chars: int = 1800, overlap: int = 250) -> list[RetrievedChunk]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    chunks: list[RetrievedChunk] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + max_chars)
        if end < len(normalized):
            newline = normalized.rfind("\n", start, end)
            if newline > start + max_chars // 2:
                end = newline
        chunks.append(RetrievedChunk(path=path, content=normalized[start:end].strip(), score=0.0))
        if end >= len(normalized):
            break
        start = max(0, end - overlap)
    return chunks


def _documents_from_context(repo_context: dict[str, Any]) -> dict[str, str]:
    documents: dict[str, str] = {}
    for key in ("rag_documents", "key_files"):
        raw = repo_context.get(key) or {}
        if isinstance(raw, dict):
            for path, content in raw.items():
                if isinstance(path, str) and isinstance(content, str) and content.strip():
                    documents.setdefault(path, content)
    return documents


def retrieve_context(
    query: str,
    repo_context: dict[str, Any],
    *,
    max_chunks: int = 6,
) -> list[RetrievedChunk]:
    """
    Lightweight lexical retrieval over cached repository files.

    This is dependency-free on purpose: it gives the chat/analysis prompts
    grounded repository snippets now, while leaving room for pgvector or a
    hosted vector store later.
    """
    documents = _documents_from_context(repo_context)
    if not documents:
        return []

    chunks: list[RetrievedChunk] = []
    for path, content in documents.items():
        chunks.extend(_chunk_text(path, content))
    if not chunks:
        return []

    query_terms = set(_tokenize(query))
    if not query_terms:
        return chunks[:max_chunks]

    tokenized_chunks = [_tokenize(chunk.content + " " + chunk.path) for chunk in chunks]
    document_frequency: dict[str, int] = {}
    for tokens in tokenized_chunks:
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1

    total_chunks = len(chunks)
    scored: list[RetrievedChunk] = []
    for chunk, tokens in zip(chunks, tokenized_chunks, strict=True):
        if not tokens:
            continue
        term_counts: dict[str, int] = {}
        for token in tokens:
            term_counts[token] = term_counts.get(token, 0) + 1

        score = 0.0
        for term in query_terms:
            count = term_counts.get(term, 0)
            if not count:
                continue
            tf = count / len(tokens)
            idf = math.log((1 + total_chunks) / (1 + document_frequency.get(term, 0))) + 1
            score += tf * idf

        path_bonus = sum(1 for term in query_terms if term in chunk.path.lower()) * 0.05
        score += path_bonus
        if score > 0:
            scored.append(RetrievedChunk(path=chunk.path, content=chunk.content, score=score))

    scored.sort(key=lambda chunk: chunk.score, reverse=True)
    return scored[:max_chunks]


def format_retrieved_context(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "No matching repository snippets were retrieved."

    formatted: list[str] = []
    for chunk in chunks:
        formatted.append(
            f"### {chunk.path} (score: {chunk.score:.4f})\n"
            f"```\n{chunk.content[:1800]}\n```"
        )
    return "\n\n".join(formatted)
