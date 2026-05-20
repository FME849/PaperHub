# Quickstart: Tracked Research Topics with Periodic Paper Fetch

**Branch**: `002-topic-subscription` | **Date**: 2026-05-18 | **Plan**: [plan.md](./plan.md)

This is a manual walkthrough for an engineer (or reviewer) to validate the feature end-to-end on a developer laptop. It assumes 001 is already running locally (MySQL + backend + a registered user). If not, run the 001 quickstart first.

There is no frontend in this iteration (per plan); all walkthrough steps use `curl`.

---

## 1. Prerequisites

- Node.js 20+ installed.
- Docker Desktop running (the MySQL container from 001).
- 001 backend at `/backend` already booted at least once (so the User table exists and `.env` is configured).
- `jq` installed (for nicer `curl` output). Optional but recommended.

---

## 2. Install new backend dependencies

```bash
cd backend
npm install node-cron fast-xml-parser
npm install --save-dev @types/node-cron
```

---

## 3. Update `.env` (extend, do not replace)

Append the new variables to `backend/.env`. Defaults shown match `research.md` Decision 7 and Decision 4.

```bash
# Scheduler
FETCH_CRON_EXPR="0 3 * * *"          # daily at 03:00 UTC; use "*/2 * * * *" for local testing

# arXiv
ARXIV_BASE_URL="https://export.arxiv.org/api/query"
ARXIV_MIN_REQUEST_INTERVAL_MS=3000
ARXIV_MAX_RETRIES=3

# Per-user / per-topic limits
MAX_TOPICS_PER_USER=20
MAX_KEYWORDS_PER_TOPIC=15
MAX_FILTERS_PER_TOPIC=10
MAX_KEYWORD_LENGTH=80
MAX_TOPIC_NAME_LENGTH=120
MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE=50

# Incremental window floor when a topic has no lastFetchedAt yet
INITIAL_FETCH_WINDOW_HOURS=24
```

Also update `backend/.env.example` with the same keys (no values for secrets, sensible non-secret defaults retained).

---

## 4. Apply the new migration

```bash
cd backend
npx prisma migrate dev --name tracked_topics
```

This creates `prisma/migrations/0002_tracked_topics/migration.sql` and applies it. Verify with `npx prisma studio` — you should see the four new tables: `TrackedTopic`, `Paper`, `TopicPaperMatch`, `FetchCycle`.

---

## 5. Boot the backend (now includes the scheduler)

```bash
cd backend
npm run dev
```

Expected log lines on startup (in addition to 001's startup output):

```text
[scheduler] node-cron registered fetchCycle on "0 3 * * *"
[startup] recovered 0 RUNNING fetch cycles (none in flight from prior run)
```

If a prior crash left a `RUNNING` row, you'll see e.g. `recovered 1 RUNNING fetch cycle → marked FAILED`.

---

## 6. Obtain a JWT (reuse 001's login flow)

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"researcher@example.com","password":"SuperSecret1!"}' \
  | jq -r .token)
echo "$TOKEN" | head -c 40 ; echo
```

If you don't yet have a user, register one via 001's `POST /api/auth/register`.

---

## 7. Fetch the source catalog

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/sources | jq
```

Expected: a `sources` array with one element (id `"arxiv"`) and ~40 filter values. Confirms `config/sources.ts` is loaded.

---

## 8. Create a tracked topic

```bash
curl -s -X POST http://localhost:4000/api/topics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Diffusion models for protein folding",
    "keywords": ["diffusion model", "protein folding", "denoising"],
    "sourceFilters": ["arxiv:cs.LG", "arxiv:q-bio.BM"]
  }' | jq
```

Expected: `201 Created` and a `TrackedTopic` JSON body with `lastFetchedAt: null`, `id: "ck..."` — save the `id`:

```bash
TOPIC_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/topics | jq -r '.items[0].id')
echo "$TOPIC_ID"
```

### Verify failure modes (smoke test)

```bash
# Duplicate name (case-insensitive)
curl -s -X POST http://localhost:4000/api/topics \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"DIFFUSION MODELS for PROTEIN folding","keywords":["x"],"sourceFilters":["arxiv:cs.LG"]}' | jq
# → 409 DUPLICATE_NAME

# Unknown source filter
curl -s -X POST http://localhost:4000/api/topics \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Bad source","keywords":["x"],"sourceFilters":["arxiv:cs.ZZZ"]}' | jq
# → 422 VALIDATION_FAILED with details.sourceFilters[0]

# Missing keywords
curl -s -X POST http://localhost:4000/api/topics \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Empty kw","keywords":[],"sourceFilters":["arxiv:cs.LG"]}' | jq
# → 422 VALIDATION_FAILED
```

---

## 9. Open the per-topic paper view (before any fetch cycle)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/topics/$TOPIC_ID/papers" | jq
```

Expected: `items: []`, `topic.lastFetchedAt: null`. This is the "first cycle pending" empty state (FR-023).

---

## 10. Trigger one fetch cycle manually (for testing)

For local validation we don't want to wait until 03:00 UTC. Two options:

**Option A — temporarily set `FETCH_CRON_EXPR="*/2 * * * *"`** in `.env`, restart `npm run dev`, and wait ~2 minutes. Watch logs.

**Option B — invoke the cycle directly via a one-off script.** Add a tiny `scripts/run-cycle-once.ts` to `/backend` that imports and calls `fetchCycle.service.run()`, then:

```bash
cd backend
npx tsx scripts/run-cycle-once.ts
```

Either way, expected log shape:

```text
[fetch-cycle] start cycle=ck... (RUNNING)
[fetch-cycle] topic=ck... window=2026-05-17T03:00..2026-05-18T03:00 → arxiv query
[arxiv-client] GET https://export.arxiv.org/api/query?search_query=...&start=0&max_results=200
[fetch-cycle] topic=ck... fetched=12 newAttributions=7 (capped at MAX_NEW_PAPERS_PER_TOPIC_PER_CYCLE=50)
[fetch-cycle] cycle=ck... SUCCEEDED stats={"sources":{"arxiv":{"ok":1,"fail":0}},"topics":{"matched":1,"newMatches":7}}
```

---

## 11. Re-open the per-topic paper view

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/topics/$TOPIC_ID/papers?sort=publishedAt&order=desc&limit=10" | jq
```

Expected: `items` with at least 1 entry (assuming arXiv has fresh papers matching your keywords in the last 24h — plausible for a topic like the example above), each entry containing `title`, `abstract`, `authors`, `sourceUrl`, `publishedAt`, `matchedAt`. `topic.lastFetchedAt` is now non-null.

---

## 12. Re-run the cycle — verify de-duplication (FR-013)

Trigger the cycle a second time within the same window (Option B above is most convenient). Expected log line per topic:

```text
[fetch-cycle] topic=ck... fetched=12 newAttributions=0 (all already attributed)
```

And the per-topic paper view returns the same items, not duplicated. This validates the `@@unique([trackedTopicId, paperId])` constraint at runtime.

---

## 13. Edit the topic and re-run — verify FR-016 (latest config wins)

```bash
curl -s -X PATCH http://localhost:4000/api/topics/$TOPIC_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"keywords":["diffusion","flow matching","protein folding"]}' | jq
```

Trigger the cycle. The next per-topic fetch uses the new keyword set (you'll see the new query string in the `[arxiv-client]` log).

---

## 14. Verify deletion scope (FR-006 / Edge Cases)

Create a second topic that overlaps the first (so they will share matched papers — e.g., both subscribe to `arxiv:cs.LG` with "diffusion"). Run a cycle. Confirm both topics have the same paper in their views.

Then delete the first topic:

```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/topics/$TOPIC_ID -o /dev/null -w "%{http_code}\n"
# → 204
```

Verify:

```bash
# First topic is gone:
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/topics/$TOPIC_ID/papers" -w "%{http_code}\n"
# → 404

# Second topic STILL shows the shared papers (FR-006: Paper records untouched, other topics' attributions untouched):
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/topics/$TOPIC_ID_2/papers" | jq '.items | length'
# → non-zero
```

Open Prisma Studio and confirm: `Paper` table row counts unchanged after the delete; `TopicPaperMatch` rows for the deleted topic gone; rows for the surviving topic intact.

---

## 15. Cross-user isolation spot-check (FR-007 / FR-012)

Register a second user with 001's flow. Log in. Hit `GET /api/topics` — should return `items: []` (no leak from user 1). Try `GET /api/topics/$TOPIC_ID_2` from user 2's token — should return `404` (no enumeration via `403`).

---

## What passing this quickstart means

If steps 1–15 succeed, the feature satisfies:

- All P1 / P2 / P3 acceptance scenarios from the spec.
- FR-001 through FR-027 by direct exercise or by schema/middleware enforcement (see the cross-reference table at the bottom of `data-model.md`).
- SC-001 (create flow under 60 s by hand), SC-002 (CRUD reflected within 1 s — observable), SC-006 (zero duplicate attributions after step 12), and the spirit of SC-005 (single-cycle reliability).

What this quickstart does **not** cover:

- SC-005's weekly-reliability claim (needs a week of operation; track separately during burn-in).
- SC-009 (false-alert rate; needs real users post-launch).
- Frontend integration (deferred).

---

## Troubleshooting

- **`arxiv-client` logs `429 Too Many Requests`**: someone is running the cycle at < 3s spacing. Confirm `ARXIV_MIN_REQUEST_INTERVAL_MS=3000` in `.env` and that only one process is running.
- **Cycle hangs in `RUNNING` after a crash**: restart the backend; startup recovery promotes stuck `RUNNING` rows to `FAILED` (Decision 12).
- **`409 DUPLICATE_NAME` when you don't expect it**: case-insensitive uniqueness — check for an existing topic whose `nameLower` matches.
- **Empty `items` after a successful cycle**: the keyword/category combination is genuinely quiet in the last 24h window. Try the example "diffusion models" topic above, which reliably matches multiple papers per day in `cs.LG`.
