# Full Corpus Ingestion Report (Liechtenstein)

Date: February 22, 2026
Source portal: https://www.gesetze.li/konso

## Outcome

- Public corpus discovery completed from `Gebietssystematik`.
- Discovered law links: **3,614**
- Seed files covering discovered corpus: **3,614**
- Uncovered discovered laws: **0**

## Ingestion Summary

From `data/source/full-corpus-ingestion-report.json` (generated February 21, 2026):

- Attempted: 3,614
- Ingested: 3,594
- Cached: 20
- Skipped: 0
- Parsed provisions: 72,239
- Parsed definitions: 2,665

## Database Build Summary

From `npm run build:db` after full ingestion:

- Documents: 3,614
- Provisions: 73,213
- Definitions: 2,665
- EU documents: 3,370
- EU references: 12,631

## Character Match Verification

Three provisions were verified against official source parsing and matched character-by-character:

1. `li-datenschutzgesetz` / `art1`
2. `li-cybersicherheitsgesetz` / `art3`
3. `li-konso-1003001000` / `par2`

## Validation Status

All required checks passed after ingestion:

- `npm run build`
- `npm test`
- `npx tsc --noEmit`

## Notes on Corpus Boundaries

- Coverage is complete for laws discoverable via public `konso` index surfaces used by the crawler.
- Portal search endpoints (`/konso/suche`, `/chrono/suche`) are gateway/session-protected and not reliably enumerable in this environment.
