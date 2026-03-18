#!/usr/bin/env python3
"""Stage 1: Parse SRT files into timestamped segments, dropping duplicate blocks and annotations."""

import json
import re
import sys
from pathlib import Path

PIPELINE = Path(__file__).parent
GDC = PIPELINE.parent
PARSED_DIR = PIPELINE / "parsed"
ANNOTATION_RE = re.compile(r"\[.*?\]")


def parse_timestamp(ts: str) -> int:
    h, m, rest = ts.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms)


def parse_srt(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8", errors="replace")
    blocks = re.split(r"\n\n+", text.strip())
    segments = []
    for block in blocks:
        lines = block.strip().split("\n")
        if len(lines) < 2:
            continue
        ts_match = re.match(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})", lines[1])
        if not ts_match:
            continue
        start_ms = parse_timestamp(ts_match.group(1))
        end_ms = parse_timestamp(ts_match.group(2))
        content = " ".join(lines[2:]).strip()
        segments.append({"start_ms": start_ms, "end_ms": end_ms, "text": content})
    return segments


def clean_segments(segments: list[dict]) -> list[dict]:
    result = []
    for seg in segments:
        if seg["end_ms"] - seg["start_ms"] <= 10:
            continue
        text = ANNOTATION_RE.sub("", seg["text"]).strip()
        if not text:
            continue
        result.append({"start_ms": seg["start_ms"], "end_ms": seg["end_ms"], "text": text})
    return result


def main():
    PARSED_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((GDC / "manifest.json").read_text())

    total = 0
    skipped = 0
    for entry in manifest:
        vid = entry["id"]
        out_path = PARSED_DIR / f"{vid}.json"
        if out_path.exists():
            skipped += 1
            total += 1
            continue

        transcript_rel = entry.get("transcript")
        if not transcript_rel:
            continue
        transcript_path = GDC / transcript_rel
        if not transcript_path.exists():
            continue

        segments = clean_segments(parse_srt(transcript_path))
        out_path.write_text(json.dumps(segments))
        total += 1

    print(f"Parsed {total} videos ({skipped} already existed)")


if __name__ == "__main__":
    main()
