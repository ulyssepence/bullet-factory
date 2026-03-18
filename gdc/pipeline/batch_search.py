#!/usr/bin/env python3
"""Batch search: run many queries and output structured results."""

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
LIMIT = 5

QUERIES = {
    "Game feel & juice": [
        "game feel what makes it satisfying",
        "juice screen shake particles",
        "hit feedback combat feel",
        "camera shake camera movement gameplay",
        "animation principles game design",
        "weight and impact in games",
    ],
    "Survivors-like / roguelike genre": [
        "vampire survivors design",
        "roguelike progression system",
        "bullet hell pattern design",
        "power fantasy escalation",
        "roguelike item synergy",
        "horde game design",
        "run-based progression meta progression",
    ],
    "Difficulty & pacing": [
        "difficulty curve player skill",
        "pacing rhythm level design",
        "too easy too hard player frustration",
        "rubber banding difficulty scaling",
        "when to end the game session length",
    ],
    "Player psychology & engagement": [
        "why players quit",
        "what makes a game addictive",
        "player motivation intrinsic reward",
        "meaningful choice game design",
        "dopamine reward loop",
        "risk reward tension",
    ],
    "Visual clarity & readability": [
        "visual clarity action game",
        "color readability gameplay",
        "too many particles visual noise",
        "UI design action game",
        "health bar enemy telegraph",
        "silhouette readability",
    ],
    "Audio": [
        "sound design player feedback",
        "audio impact combat sound",
        "music pacing intensity",
        "procedural audio game",
    ],
    "Onboarding & first minutes": [
        "first five minutes player experience",
        "tutorial without tutorial",
        "teaching mechanics without text",
        "onboarding complexity",
    ],
    "Procedural generation": [
        "procedural generation feels random",
        "procedural content boring",
        "level generation hand-crafted feel",
        "meaningful procedural variety",
    ],
    "Polish & common mistakes": [
        "what makes indie games feel amateur",
        "most common game design mistakes",
        "postmortem what went wrong",
        "playtesting surprised us",
        "cut features made the game better",
    ],
    "Mobile-specific": [
        "mobile game controls touch",
        "mobile performance optimization",
        "small screen game design",
    ],
}


def embed_query(text: str) -> list[float]:
    payload = json.dumps({"model": OLLAMA_MODEL, "input": ["search_query: " + text]}).encode()
    req = urllib.request.Request(OLLAMA_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    v = data["embeddings"][0][:EMBED_DIM]
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v] if norm > 0 else v


def main():
    db = lancedb.connect(DB_PATH)
    table = db.open_table(TABLE_NAME)

    all_results = {}
    seen_urls = set()
    total = sum(len(qs) for qs in QUERIES.values())
    done = 0

    for category, queries in QUERIES.items():
        cat_results = []
        for query in queries:
            vec = embed_query(query)
            results = table.search(vec).metric("cosine").limit(LIMIT).to_list()
            hits = []
            for r in results:
                url = r["youtube_url"].split("&t=")[0]
                score = 1 - r["_distance"]
                hits.append({
                    "title": r["title"],
                    "youtube_url": r["youtube_url"],
                    "video_id": r["video_id"],
                    "score": round(score, 4),
                    "text": r["text"][:500],
                    "is_new": url not in seen_urls,
                })
                seen_urls.add(url)
            cat_results.append({"query": query, "hits": hits})
            done += 1
            print(f"  [{done}/{total}] {query}")
        all_results[category] = cat_results

    out_path = PIPELINE / "batch_results.json"
    out_path.write_text(json.dumps(all_results, indent=2))
    print(f"\nDone. {len(seen_urls)} unique videos across {total} queries. Results in {out_path}")


if __name__ == "__main__":
    main()
