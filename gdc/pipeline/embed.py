#!/usr/bin/env python3
"""Stage 3: Embed chunks into LanceDB using nomic-embed-text via Ollama."""

import json
import math
import sys
import urllib.request
from pathlib import Path

import pyarrow as pa
import lancedb

PIPELINE = Path(__file__).parent
CHUNKS_PATH = PIPELINE / "chunks.jsonl"
DB_PATH = str(PIPELINE / "gdc.lance")
TABLE_NAME = "chunks"
BATCH_SIZE = 256
EMBED_DIM = 256
OLLAMA_URL = "http://localhost:11434/api/embed"
OLLAMA_MODEL = "nomic-embed-text"
PROGRESS_PATH = PIPELINE / ".embed_progress"


def embed_batch(texts: list[str]) -> list[list[float]]:
    payload = json.dumps({"model": OLLAMA_MODEL, "input": texts}).encode()
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    vecs = []
    for v in data["embeddings"]:
        truncated = v[:EMBED_DIM]
        norm = math.sqrt(sum(x * x for x in truncated))
        vecs.append([x / norm for x in truncated] if norm > 0 else truncated)
    return vecs


def get_progress() -> int:
    if PROGRESS_PATH.exists():
        return int(PROGRESS_PATH.read_text().strip())
    return 0


def save_progress(n: int):
    PROGRESS_PATH.write_text(str(n))


def main():
    chunks = []
    with open(CHUNKS_PATH) as f:
        for line in f:
            chunks.append(json.loads(line))

    start_idx = get_progress()
    if start_idx >= len(chunks):
        print(f"All {len(chunks)} chunks already embedded.")
        return

    print(f"Total chunks: {len(chunks)}, resuming from index {start_idx}")

    db = lancedb.connect(DB_PATH)

    schema = pa.schema([
        ("id", pa.string()),
        ("video_id", pa.string()),
        ("title", pa.string()),
        ("description", pa.string()),
        ("upload_date", pa.string()),
        ("youtube_url", pa.string()),
        ("start_seconds", pa.int64()),
        ("chunk_index", pa.int64()),
        ("text", pa.string()),
        ("vector", pa.list_(pa.float32(), EMBED_DIM)),
    ])

    table = None
    if TABLE_NAME in db.list_tables():
        table = db.open_table(TABLE_NAME)

    for batch_start in range(start_idx, len(chunks), BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, len(chunks))
        batch = chunks[batch_start:batch_end]

        texts = ["search_document: " + c["text"] for c in batch]
        embeddings = embed_batch(texts)

        rows = []
        for i, chunk in enumerate(batch):
            rows.append({
                "id": chunk["id"],
                "video_id": chunk["video_id"],
                "title": chunk["title"],
                "description": chunk["description"],
                "upload_date": chunk.get("upload_date", ""),
                "youtube_url": chunk["youtube_url"],
                "start_seconds": chunk["start_seconds"],
                "chunk_index": chunk["chunk_index"],
                "text": chunk["text"],
                "vector": embeddings[i],
            })

        if table is None:
            table = db.create_table(TABLE_NAME, data=rows, schema=schema)
        else:
            table.add(rows)

        save_progress(batch_end)
        pct = batch_end / len(chunks) * 100
        print(f"  embedded {batch_end}/{len(chunks)} ({pct:.1f}%)")

    print(f"Done. {len(chunks)} chunks embedded in {DB_PATH}")


if __name__ == "__main__":
    main()
