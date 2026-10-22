# Knowledge corpus

Generated retrieval corpus for the TFT Assistant. **Do not edit `chunks.jsonl` by hand** — edit the sources and rebuild.

## Sources

| Source | File | Count |
|---|---|---|
| General + Set 18 mechanics | `packages/shared/data/mechanics-knowledge.json` + `packages/shared/src/mechanics.ts` tables | 2 documents |
| Guides | `apps/api/seed/guides.ts` | 6 |
| Tips | `apps/api/seed/tips.ts` | 21 |

Current output: **184 chunks from 29 sources**, split evenly between English and Vietnamese.

Guide and tip copy is editorial content seeded into Postgres. Confirm reuse rights before exposing it outside this project.

Entity facts (champions, items, augments, traits, comps) intentionally stay out of this corpus; deterministic orchestrator tools resolve those. This corpus is for mechanics and editorial guidance.

## Build

```bash
npm run build:knowledge
```

Outputs:

- `apps/api/data/knowledge/chunks.jsonl` — one JSON object per chunk, sorted by stable ID.
- `apps/api/data/knowledge/manifest.json` — counts, per-source version/URL, language coverage.

Chunk IDs are stable while the source ID, language, section key and split index stay unchanged. Each chunk carries a SHA-256 prefix so content changes are detectable.

## Chunk shape

```json
{
  "id": "mechanics:18:en:wisps:0",
  "sourceId": "mechanics:18",
  "sourceType": "mechanics",
  "documentTitle": "Set 18 — Enchanted Wilds",
  "sectionTitle": "Wisps",
  "url": "https://teamfighttactics.leagueoflegends.com/en-us/",
  "version": "18.4",
  "updated": "2026-10-21",
  "lang": "en",
  "text": "...",
  "tags": ["mechanics", "set-18", "wisps"],
  "priority": 1,
  "checksum": "0123456789abcdef"
}
```

Sections are split at sentence boundaries above 1,100 characters with 150 characters of overlap. Mechanics chunks keep one topic per chunk; guides/tips get a summary chunk plus one chunk per section.

## Retrieval baseline

```bash
npm run test:rag
```

`apps/api/src/assistant/retrieval.ts` is an in-memory BM25 index with diacritic-insensitive Vietnamese tokenization, plural/`-ing`/`-ed` folding, language filtering and section-title boosting. It is a baseline, not a vector store.

The eval set is `apps/api/src/assistant/eval/rag-cases.jsonl`: **32 positive and 4 negative cases** across mechanics, guides, tips, English and Vietnamese. Labels are chunk IDs; the runner rejects missing or wrong-language labels.

Current baseline (`rag-baseline.json`): hit@1 **84.4%**, hit@3 **100%**, hit@5 **100%**, MRR@10 **0.917**, negative accuracy **100%**.

Write a new baseline after an intentional retrieval/data change:

```bash
npm run test:rag --workspace @metaboard/api -- --write
```

## Change workflow

1. Edit the source JSON/TS.
2. Run `npm run build:knowledge`.
3. Run `npm run test:server` and `npm run test:rag`.
4. Add or update eval cases for new topics; never relabel a case only to hide a regression.
5. Review `apps/api/data/knowledge/manifest.json` diff before shipping.

## Limits

- BM25 only; no embeddings, reranker or pgvector.
- One set (`18`) plus stable general rules; no historical set switching.
- No patch-notes corpus, so patch-change questions remain unsupported.
- Chunk labels include summary + target section for guide/tip queries; retrieval is source-level adequate, not paragraph-perfect.
