#!/usr/bin/env python3
"""Stage 4: Semantic search over GDC talks via LanceDB."""

import argparse
import json
import math
import urllib.request
from pathlib import Path

import lancedb

PIPELINE = Path(__file__).parent
DB_PATH = str(PIPELINE / "gdc.lance")
TABLE_NAME = "chunks"
EMBED_DIM = 256
OLLAMA_URL = "http://localhost:11434/api/embed"
OLLAMA_MODEL = "nomic-embed-text"


def embed_query(text: str) -> list[float]:
    payload = json.dumps({"model": OLLAMA_MODEL, "input": ["search_query: " + text]}).encode()
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    v = data["embeddings"][0][:EMBED_DIM]
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v] if norm > 0 else v


def main():
    parser = argparse.ArgumentParser(description="Search GDC talks")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--limit", "-n", type=int, default=5, help="Number of results")
    args = parser.parse_args()

    db = lancedb.connect(DB_PATH)
    table = db.open_table(TABLE_NAME)

    vec = embed_query(args.query)
    results = table.search(vec).metric("cosine").limit(args.limit).to_list()

    for i, r in enumerate(results):
        score = 1 - r["_distance"]
        snippet = r["text"][:200].replace("\n", " ")
        print(f"\n{'='*80}")
        print(f"[{i+1}] {r['title']}")
        print(f"    {r['youtube_url']}")
        print(f"    score={score:.4f}  date={r['upload_date']}")
        print(f"    {snippet}...")


if __name__ == "__main__":
    main()
