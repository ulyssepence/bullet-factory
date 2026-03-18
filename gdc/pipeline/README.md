# GDC Transcript Search Pipeline

Semantic search over 1,835 GDC talks. Four stages, each resumable (skips existing output).

## Prerequisites

- **Ollama** running locally with `nomic-embed-text` model pulled:
  ```bash
  ollama pull nomic-embed-text
  ```
- Python venv with deps:
  ```bash
  cd gdc
  uv venv .venv && uv pip install -r pipeline/requirements.txt --python .venv/bin/python
  ```

## Usage

Run from `gdc/` directory, in order:

```bash
.venv/bin/python pipeline/parse.py     # SRT → timestamped segments (~1835 files, seconds)
.venv/bin/python pipeline/chunk.py     # segments → ~108K search chunks (~1 min)
.venv/bin/python pipeline/embed.py     # chunks → LanceDB vectors via Ollama (~90 min)
.venv/bin/python pipeline/search.py "roguelike progression design"
.venv/bin/python pipeline/search.py "shader optimization mobile" --limit 10
```

Batch search (50 queries across 10 categories):
```bash
.venv/bin/python pipeline/batch_search.py   # outputs pipeline/batch_results.json
```

## How it works

- **Embedding model**: `nomic-embed-text` via Ollama HTTP API (localhost:11434)
- **Matryoshka truncation**: 768-dim → 256-dim with L2 re-normalization. If swapping models, adjust `EMBED_DIM` in embed.py and search.py.
- **Nomic prefixes**: embed.py prepends `"search_document: "` to chunks, search.py prepends `"search_query: "` to queries. These are required by nomic-embed and must match. Remove if swapping models.
- **Token counting**: chunk.py approximates tokens as `words * 1.3` (close enough for BPE on English speech transcripts, avoids HF tokenizer dependency).
- **Resume**: parse.py skips existing output files, chunk.py skips processed video IDs, embed.py tracks progress in `.embed_progress`.

## Output

```
pipeline/
  parsed/{id}.json       — per-video timestamped segments
  chunks.jsonl           — all chunks with metadata
  gdc.lance/             — LanceDB vector database (275MB)
  batch_results.json     — results from batch_search.py
  .embed_progress        — embed.py resume checkpoint
```
