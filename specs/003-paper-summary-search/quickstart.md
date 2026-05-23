# Quickstart: Paper Reading Experience (Search + Detail + Summaries + Bookmarks + Recommendations)

**Branch**: `003-paper-summary-search` | **Date**: 2026-05-23 | **Plan**: [plan.md](./plan.md)

Manual walkthrough for an engineer to validate the feature end-to-end on a developer laptop. Assumes `001` and `002` are already running locally (MySQL + backend + a registered user + at least one tracked topic with fetched papers). If not, run those quickstarts first.

There is no frontend in this iteration; all steps use `curl` and Prisma Studio.

---

## 1. Prerequisites

- `001` + `002` quickstarts already completed at least once. You should have:
  - A running MySQL container (`paperhub-mysql`).
  - At least one user (e.g., `researcher@example.com`).
  - At least one tracked topic with ≥ 5 fetched papers (run `npx tsx scripts/run-cycle-once.ts` from `002` if needed).
- A **Google Gemini API key** from Google AI Studio (https://aistudio.google.com/apikey). The walkthrough uses `gemini-2.0-flash`, which is on the free tier (15 RPM / 1500 RPD). Expected spend: $0.00.
- `jq` installed.

---

## 2. Install new backend dependency

```bash
cd backend
npm install @google/generative-ai
```

---

## 3. Update `backend/.env` (extend, do not replace)

Append:

```bash
# Gemini (AI provider, v1 default)
GEMINI_API_KEY="AIza..."             # required; obtain from https://aistudio.google.com/apikey
GEMINI_MODEL="gemini-2.0-flash"
AI_PER_CYCLE_SUMMARY_CAP=50          # default conservative for free-tier (15 RPM / 1500 RPD)
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=1

# Search
SEARCH_DEFAULT_LIMIT=20
SEARCH_MAX_LIMIT=50

# Recommendations
RECOMMENDATIONS_DEFAULT_LIMIT=10
RECOMMENDATIONS_MAX_LIMIT=20
```

Also update `backend/.env.example` with the same keys (no secret values).

---

## 4. Apply the new migration

```bash
cd backend
npx prisma migrate dev --name paper_summaries
```

Verify with Prisma Studio: a new `PaperSummary` table should exist, plus a new `FULLTEXT` index on `Paper(title, abstract)`.

To confirm the FULLTEXT index:

```bash
docker exec paperhub-mysql mysql -uroot -ppaperhub paperhub \
  -e "SHOW INDEX FROM Paper WHERE Index_type = 'FULLTEXT';"
```

You should see `Paper_title_abstract_fulltext`.

---

## 5. Boot the backend

```bash
cd backend
npm run dev
```

Expected startup logs (in addition to `001` / `002` lines):

```text
[ai] configured provider=gemini model=gemini-2.0-flash per-cycle-cap=50
```

---

## 6. Get a JWT (reuse `001`'s login)

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"researcher@example.com","password":"SuperSecret1!"}' \
  | jq -r .token)
echo "$TOKEN" | head -c 40 ; echo
```

---

## 7. Smoke-test US1: search the catalog (no summaries yet)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/search/papers?q=diffusion&limit=5" | jq
```

Expected: a `200` with `items` containing matching papers from your catalog, ordered by relevance score. Each item has `summaryAvailable: false` for now (nothing has been summarised yet).

Try empty-state path:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/search/papers?q=xyz_unlikely_match_zzz" | jq
# → { "query": "...", "items": [], }
```

---

## 8. Smoke-test US2: paper detail view (no summary yet)

```bash
PAPER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/search/papers?q=diffusion&limit=1" | jq -r '.items[0].id')
echo "paper: $PAPER_ID"

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/papers/$PAPER_ID" | jq
```

Expected: full paper metadata, `summary.status: "PENDING_RETRY"` (no row yet — service treats this as "pending"), `bullets: []`, `topics: [...]`, `isFavorited: false`, `favoritedAt: null`.

Try a paper that's NOT in your catalog (e.g., generate a fake cuid):

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/papers/ckaaaa0000000000000000" -w "\nHTTP=%{http_code}\n"
# → 404 Paper not found.
```

---

## 9. Trigger summarisation (US3) — via the run-once cycle script

The summarisation step is wired into `002`'s `fetchCycle.service.run()` as a post-persistence hook. To exercise it without waiting for the scheduled cron:

```bash
npx tsx scripts/run-cycle-once.ts
```

Expected log lines (in addition to `002`'s):

```text
[summaries] paper=cmpd... status=PENDING_RETRY → calling AI service
[gemini] generateContent model=gemini-2.0-flash tokens_in=~400 tokens_out=~150
[summaries] paper=cmpd... status=SUCCEEDED bullets=4
...
[fetch-cycle] cycle=... SUCCEEDED stats={... "summaries":{"attempted":12,"succeeded":12,"failed":0,"skipped":0}}
```

Re-run:

```bash
GET http://localhost:4000/api/papers/$PAPER_ID
```

`summary.status` should now be `"SUCCEEDED"` with a non-empty `bullets` array (3–5 entries).

### One-time backfill (Decision 13)

To summarise the rest of the catalog without waiting for another ingestion cycle:

```bash
npx tsx scripts/backfill-summaries.ts
```

Watch the log for `[backfill]` lines. The script respects `AI_PER_CYCLE_SUMMARY_CAP` — run it again if your catalog exceeds the cap. Mind Gemini's free-tier daily limit (1500 RPD) when running large backfills.

---

## 10. Verify US3 invariants

### One summary per paper (FR-013)

```bash
docker exec paperhub-mysql mysql -uroot -ppaperhub paperhub \
  -e "SELECT COUNT(*) AS papers, SUM(IF(s.id IS NULL,0,1)) AS summaries \
      FROM Paper p LEFT JOIN PaperSummary s ON s.paperId = p.id;"
```

`summaries ≤ papers` always. Re-running step 9 must NOT increase `summaries` beyond `papers`.

### No second AI call on re-attribution (FR-014)

```bash
# Create a second tracked topic that overlaps with the existing one
TOPIC_ID_2=$(curl -s -X POST http://localhost:4000/api/topics \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Diffusion v2","keywords":["diffusion"],"sourceFilters":["arxiv:cs.LG"]}' \
  | jq -r .id)

# Run another cycle — papers shared between topics MUST NOT be re-summarised
npx tsx scripts/run-cycle-once.ts
```

In the cycle's log: `summaries.attempted` should reflect ONLY genuinely-new papers (not re-attributions). Confirm by checking `PaperSummary` row count is unchanged.

### Pending retry on AI failure

Temporarily set `GEMINI_API_KEY="invalid"` in `.env`, restart `npm run dev`, run a cycle. Papers should be persisted with `summary.status = "PENDING_RETRY"`. Restore the real key, run another cycle — the same papers should now reach `SUCCEEDED` without operator intervention.

---

## 11. Smoke-test US4: bookmark / unbookmark

```bash
# Bookmark
curl -s -X POST http://localhost:4000/api/favorites \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"paperId\":\"$PAPER_ID\"}" -w "\nHTTP=%{http_code}\n"
# → 201

# Idempotent re-bookmark
curl -s -X POST http://localhost:4000/api/favorites \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"paperId\":\"$PAPER_ID\"}" -w "\nHTTP=%{http_code}\n"
# → 200

# Favourites list with full paper data (NEW endpoint)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/favorites/papers" | jq

# Try to bookmark a paper NOT in your catalog (use a random cuid)
curl -s -X POST http://localhost:4000/api/favorites \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"paperId":"ckzzzz0000000000000000"}' -w "\nHTTP=%{http_code}\n"
# → 404

# Unbookmark
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/favorites/$PAPER_ID" -w "\nHTTP=%{http_code}\n"
# → 204
```

### Verify bookmark persistence after topic deletion (Q4 = A)

1. Bookmark a paper, then delete the topic that fetched it.
2. `GET /api/favorites/papers` — the bookmark MUST still appear; the `topics` array may be `[]` and `inCatalog: false` (Decision 10).
3. `GET /api/papers/$PAPER_ID` — MUST still return `200` (access via favourite, not via current topic attribution).

---

## 12. Smoke-test US5: search filters

```bash
# By topic
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/search/papers?q=diffusion&topicId=$TOPIC_ID_2&limit=5" | jq '.items | length'

# By date range
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/search/papers?q=diffusion&publishedFrom=2026-05-01&publishedTo=2026-05-31" | jq

# By author
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/search/papers?q=diffusion&author=Smith" | jq

# Combined (AND semantics — FR-027)
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/search/papers?q=diffusion&topicId=$TOPIC_ID_2&author=Smith" | jq
```

Each call should narrow results monotonically.

---

## 13. Smoke-test US6: related papers

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/papers/$PAPER_ID/related?limit=5" | jq
```

Expected:

- `origin.id` matches `$PAPER_ID`.
- `items` contains up to 5 other papers from YOUR catalog, ordered by similarity score.
- The origin paper itself MUST NOT appear in `items` (FR-030).
- Every item's `topics[]` references one of YOUR tracked topics; no cross-user paper appears (FR-031).
- Each item has a `reasons[]` explaining why it was recommended.

### Edge case: catalog too small

If your catalog has only one paper, `items` should be `[]` with `200 OK`, not an error (FR-033).

---

## 14. Cross-user isolation spot-check (FR-031)

Register a second user via `001`. Log in. From that token:

```bash
# Search should return empty (the second user has no topics yet)
curl -s -H "Authorization: Bearer $TOKEN_USER_2" \
  "http://localhost:4000/api/search/papers?q=diffusion" | jq '.items | length'
# → 0

# Try to fetch the first user's paper detail
curl -s -H "Authorization: Bearer $TOKEN_USER_2" \
  "http://localhost:4000/api/papers/$PAPER_ID" -w "\nHTTP=%{http_code}\n"
# → 404 (no enumeration via 403)

# Try to bookmark the first user's paper
curl -s -X POST http://localhost:4000/api/favorites \
  -H "Authorization: Bearer $TOKEN_USER_2" -H "Content-Type: application/json" \
  -d "{\"paperId\":\"$PAPER_ID\"}" -w "\nHTTP=%{http_code}\n"
# → 404
```

---

## What passing this quickstart means

If steps 1–14 succeed, the feature satisfies:

- US1 (search, FR-001 through FR-007) by direct exercise.
- US2 (paper detail, FR-008, FR-009) by direct exercise + cross-user isolation.
- US3 (auto bullet-point summaries, FR-010 through FR-019) by run-once + invariant checks.
- US4 (bookmarks, FR-020 through FR-025) including persistence after topic deletion (Decision 10).
- US5 (filters, FR-026 through FR-028) by direct exercise.
- US6 (recommendations, FR-029 through FR-033) by direct exercise.
- SC-002 (relevant paper in top 5) — observable by trying searches whose answer you already know.
- SC-003 (no cross-user leakage) — step 14.
- SC-004 (summary coverage within one cycle) — step 9.
- SC-006 (≤ 1 AI call per paper) — step 10 invariant.

What this quickstart does **not** cover:

- SC-001 latency under 1k-paper load (acceptance testing at scale).
- SC-005 (≤ 500 ms cached-summary view) — needs perf instrumentation.
- SC-008 (70% top-5 recommendation relevance) — qualitative; needs > 1 paper's worth of data and a human judge.
- Frontend integration (deferred).

---

## Troubleshooting

- **`gemini 401` / `invalid_api_key`**: check `GEMINI_API_KEY` in `.env`; restart `npm run dev`. Confirm the key was generated at https://aistudio.google.com/apikey and has the Generative Language API enabled.
- **`gemini 429` / `RESOURCE_EXHAUSTED`**: free-tier rate limit hit (15 RPM or 1500 RPD on `gemini-2.0-flash`). Lower `AI_PER_CYCLE_SUMMARY_CAP`, or wait for the next minute/day. Failed papers stay `PENDING_RETRY` and resume on the next cycle automatically.
- **`MATCH ... AGAINST` returns nothing for a short query**: MySQL's default `innodb_ft_min_token_size = 3` ignores 1–2 character tokens. Search for ≥ 3-char terms in v1, or lower the threshold in MySQL config.
- **Recommendation list is empty for every paper**: your catalog is too small. Run more `002` cycles (or backfill) to grow the candidate pool, then retry.
- **`summary.status` stuck at `PENDING_RETRY` across cycles**: check the backend log for the Gemini SDK error; common causes are expired / revoked API keys, network egress restrictions, or quota exhaustion.
