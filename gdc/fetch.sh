#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

MANIFEST_TSV="manifest.tsv"
META_DIR="meta"
TRANS_DIR="transcripts"
MANIFEST_JSON="manifest.json"

FAILED_FILE="failed.txt"

mkdir -p "$META_DIR" "$TRANS_DIR"
touch "$FAILED_FILE"

total=$(wc -l < "$MANIFEST_TSV")
i=0
skipped=0
fetched=0
failed=0

while IFS=$'\t' read -r vid_id title; do
  i=$((i + 1))

  if [[ -f "$META_DIR/${vid_id}.info.json" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  if grep -qxF "$vid_id" "$FAILED_FILE" 2>/dev/null; then
    skipped=$((skipped + 1))
    continue
  fi

  echo "[$i/$total] $vid_id: $title"

  if yt-dlp \
    --skip-download \
    --write-info-json \
    --write-auto-sub \
    --sub-lang "en" \
    --sub-format "vtt" \
    --convert-subs "srt" \
    -o "$META_DIR/%(id)s.%(ext)s" \
    "https://www.youtube.com/watch?v=${vid_id}" 2>/dev/null; then
    fetched=$((fetched + 1))
  else
    echo "  FAILED $vid_id"
    echo "$vid_id" >> "$FAILED_FILE"
    failed=$((failed + 1))
  fi

  # Move transcript to transcripts/ dir
  if [[ -f "$META_DIR/${vid_id}.en.srt" ]]; then
    mv "$META_DIR/${vid_id}.en.srt" "$TRANS_DIR/${vid_id}.srt"
  fi

  sleep 0.3
done < "$MANIFEST_TSV"

echo ""
echo "Fetch done. total=$total skipped=$skipped fetched=$fetched failed=$failed"
echo "Building manifest.json..."

# Build manifest.json from all .info.json files
python3 -c "
import json, os, glob

meta_dir = '$META_DIR'
trans_dir = '$TRANS_DIR'
manifest_tsv = '$MANIFEST_TSV'

# Read TSV order to preserve it
order = []
with open(manifest_tsv) as f:
    for line in f:
        parts = line.strip().split('\t', 1)
        if len(parts) == 2:
            order.append(parts[0])

entries = []
for vid_id in order:
    info_path = os.path.join(meta_dir, vid_id + '.info.json')
    if not os.path.exists(info_path):
        continue
    with open(info_path) as f:
        info = json.load(f)
    trans_path = os.path.join(trans_dir, vid_id + '.srt')
    entries.append({
        'id': vid_id,
        'title': info.get('title', ''),
        'description': info.get('description', ''),
        'url': f'https://www.youtube.com/watch?v={vid_id}',
        'upload_date': info.get('upload_date', ''),
        'duration': info.get('duration', 0),
        'tags': info.get('tags', []),
        'transcript': f'transcripts/{vid_id}.srt' if os.path.exists(trans_path) else None,
    })

with open('$MANIFEST_JSON', 'w') as f:
    json.dump(entries, f, indent=2)

print(f'Wrote {len(entries)} entries to $MANIFEST_JSON')
has_trans = sum(1 for e in entries if e['transcript'])
print(f'  {has_trans} with transcripts, {len(entries) - has_trans} without')
"
