#!/usr/bin/env python3
"""Stage 2: Combine parsed segments into ~250-token search chunks with overlap."""

import json
import sys
from pathlib import Path

PIPELINE = Path(__file__).parent
GDC = PIPELINE.parent
PARSED_DIR = PIPELINE / "parsed"
CHUNKS_PATH = PIPELINE / "chunks.jsonl"

TARGET_TOKENS = 250
MAX_TOKENS = 350
OVERLAP_TOKENS = 30
SENTENCE_ENDS = {ord("."): True, ord("?"): True, ord("!"): True}

def count_tokens(text: str) -> int:
    return int(len(text.split()) * 1.3)


def find_sentence_break(text: str, start: int) -> int | None:
    for i in range(len(text) - 1, start - 1, -1):
        if text[i] in ".?!":
            return i + 1
    return None


def chunk_segments(segments: list[dict], title: str) -> list[dict]:
    if not segments:
        return []

    chunks = []
    buf_text = ""
    buf_start = segments[0]["start_ms"]
    buf_tokens = 0
    prefix = title + ": "
    prefix_tokens = count_tokens(prefix)

    for seg in segments:
        seg_text = seg["text"]
        seg_tokens = count_tokens(seg_text)

        if buf_tokens + seg_tokens + prefix_tokens > MAX_TOKENS and buf_text:
            full = prefix + buf_text
            chunks.append({"start_ms": buf_start, "text": full})

            # overlap: keep tail tokens
            overlap_text = ""
            overlap_tokens = 0
            words = buf_text.split()
            for w in reversed(words):
                wt = count_tokens(w)
                if overlap_tokens + wt > OVERLAP_TOKENS:
                    break
                overlap_text = w + " " + overlap_text
                overlap_tokens += wt
            buf_text = overlap_text.strip() + " " + seg_text if overlap_text.strip() else seg_text
            buf_start = seg["start_ms"]
            buf_tokens = count_tokens(buf_text)
            continue

        if buf_text:
            buf_text += " " + seg_text
        else:
            buf_text = seg_text
            buf_start = seg["start_ms"]
        buf_tokens += seg_tokens

        if buf_tokens + prefix_tokens >= TARGET_TOKENS:
            brk = find_sentence_break(buf_text, len(buf_text) // 2)
            if brk:
                chunk_text = prefix + buf_text[:brk].strip()
                remainder = buf_text[brk:].strip()
                chunks.append({"start_ms": buf_start, "text": chunk_text})

                overlap_text = ""
                overlap_tokens = 0
                words = buf_text[:brk].split()
                for w in reversed(words):
                    wt = count_tokens(w)
                    if overlap_tokens + wt > OVERLAP_TOKENS:
                        break
                    overlap_text = w + " " + overlap_text
                    overlap_tokens += wt

                buf_text = (overlap_text.strip() + " " + remainder).strip() if overlap_text.strip() else remainder
                buf_start = seg["start_ms"]
                buf_tokens = count_tokens(buf_text)

    if buf_text.strip():
        chunks.append({"start_ms": buf_start, "text": prefix + buf_text.strip()})

    return chunks


def main():
    manifest = json.loads((GDC / "manifest.json").read_text())
    video_map = {e["id"]: e for e in manifest}

    existing_ids = set()
    if CHUNKS_PATH.exists():
        with open(CHUNKS_PATH) as f:
            for line in f:
                obj = json.loads(line)
                existing_ids.add(obj["video_id"])

    out = open(CHUNKS_PATH, "a")
    total_chunks = 0
    processed = 0

    for entry in manifest:
        vid = entry["id"]
        if vid in existing_ids:
            continue

        parsed_path = PARSED_DIR / f"{vid}.json"
        title = entry["title"]
        desc = entry.get("description", "")[:500]
        base_url = entry["url"]

        if parsed_path.exists():
            segments = json.loads(parsed_path.read_text())
            chunks = chunk_segments(segments, title)
        else:
            chunks = [{"start_ms": 0, "text": f"{title}: {desc}"}]

        for i, chunk in enumerate(chunks):
            start_s = chunk["start_ms"] // 1000
            record = {
                "id": f"{vid}_{i}",
                "video_id": vid,
                "title": title,
                "description": desc,
                "upload_date": entry.get("upload_date", ""),
                "youtube_url": f"{base_url}&t={start_s}",
                "start_seconds": start_s,
                "chunk_index": i,
                "text": chunk["text"],
            }
            out.write(json.dumps(record) + "\n")
            total_chunks += 1

        processed += 1
        if processed % 100 == 0:
            print(f"  chunked {processed} videos, {total_chunks} chunks so far...")
            out.flush()

    out.close()

    total_in_file = sum(1 for _ in open(CHUNKS_PATH))
    print(f"Done. {processed} new videos chunked. Total chunks in file: {total_in_file}")


if __name__ == "__main__":
    main()
