# Frontend Integration Guide: Email Notifications

**Audience**: frontend engineer integrating against the `004-paper-email-notifications` backend.
**Status**: as-built — reflects what the backend actually returns, not the planning contract. Where this doc and `contracts/*.md` disagree, **this doc wins**.
**Prerequisites**: you already have `001-user-auth` (JWT bearer auth), `002-topic-subscription` (topics + fetch cycles), and `003-paper-summary-search` (paper detail view at `/papers/:id`) integrated. This feature layers on top.

---

## 1. Quick orientation

- Base URL (dev): `http://localhost:4000`
- Two of the three endpoints require **JWT bearer auth** inherited from `001` — `Authorization: Bearer <token>`.
- The unsubscribe endpoint is **deliberately unauthenticated** (it is clicked from an email, no session).
- Content type: `application/json` on requests with a body.

What this feature adds:

| # | Method | Path | Auth | What it does | Story |
|---|---|---|---|---|---|
| 1 | `GET` | `/api/notifications/preference` | JWT | Read the user's email-notification toggle | US2 |
| 2 | `PUT` | `/api/notifications/preference` | JWT | Set the toggle on/off | US2 |
| 3 | `GET` | `/api/notifications/cycles/:cycleId/papers` | JWT | Papers fetched for the user in one cycle (the "See more" target) | US3 |
| 4 | `GET` | `/api/notifications/unsubscribe?token=…` | **none** | One-click unsubscribe; returns a backend-rendered HTML page | US3 |

What this feature **does NOT** ship (don't build UI for):

- No per-topic email preferences. There is exactly **one** global on/off toggle per user.
- No cadence/schedule picker. Digests follow the `002` fetch cycle; the user cannot change frequency.
- No "send me a test email" button.
- No in-app notification feed/bell. This feature is **email-only**; there is no in-app notification surface.
- The unsubscribe **landing page is rendered by the backend** (plain HTML). You do not need to build it (see §5 for the optional override).

---

## 2. Error envelope (read once)

Same plain shape as `001`/`002`/`003`:

```ts
type ErrorResponse = {
  error: string;       // human-readable
  details?: unknown;   // present only for 400 VALIDATION_FAILED (Zod flatten())
};
```

No machine-readable `code` on the wire. Distinguish by HTTP status.

| HTTP | When | Handling |
|---|---|---|
| 200 | GET/PUT success | Render / update local state. |
| 400 | Zod validation failed | Show messages from `details.fieldErrors`. |
| 401 | No / invalid / expired JWT | Redirect to login. |
| 404 | Cycle missing OR has no papers for this user | "Not found." Do **not** distinguish the two cases. |
| 5xx | Backend hiccup | "Something went wrong. Try again." |

---

## 3. The notification preference toggle (US2)

Build a single switch in account settings, e.g. **"Email me when new papers are fetched for my topics."** Default is **off**.

### `GET /api/notifications/preference`

```http
GET /api/notifications/preference
Authorization: Bearer <jwt>
```

**200 response:**

```ts
type PreferenceResponse = {
  enabled: boolean;
  lastChangedAt: string | null;   // ISO-8601; null if the user never set it
  lastChangedVia: "SETTINGS_UI" | "UNSUBSCRIBE_LINK" | "SYSTEM" | null;
};
```

```json
{ "enabled": false, "lastChangedAt": null, "lastChangedVia": null }
```

- A user who has never touched the setting returns the default shape above (all-null metadata, `enabled: false`). No row is created by reading.
- If `lastChangedVia === "UNSUBSCRIBE_LINK"`, you may optionally show a hint like *"You unsubscribed via email on {lastChangedAt}."*

### `PUT /api/notifications/preference`

```http
PUT /api/notifications/preference
Authorization: Bearer <jwt>
Content-Type: application/json

{ "enabled": true }
```

- Body is **strict**: only `{ "enabled": boolean }`. Extra keys → `400`.
- **200 response** is the same `PreferenceResponse` shape with the new state and `lastChangedVia: "SETTINGS_UI"`.
- Effect is **not immediate** — it applies starting from the **next fetch cycle**. Set expectations in copy: *"You'll start receiving emails after the next paper fetch."* Toggling on does **not** retroactively email already-fetched papers.

**UX notes:**

- Optimistically flip the switch; reconcile with the 200 body. On non-200, revert and toast.
- No confirmation modal needed for turning it off — it's reversible.

---

## 4. The "See more on PaperHub" page (US3)

Digest emails contain a **"See more on PaperHub"** link pointing at `${FRONTEND_BASE_URL}/cycles/:cycleId`. **You must add this route.** It should fetch and render the full set of papers fetched for the user in that cycle (the email only shows the top 3).

### `GET /api/notifications/cycles/:cycleId/papers`

```http
GET /api/notifications/cycles/cl9abc.../papers?limit=50&cursor=<opaque>
Authorization: Bearer <jwt>
```

**Query params:** `limit` (1–200, default 50), `cursor` (opaque; pass back `nextCursor` for the next page).

**200 response:**

```ts
type CyclePapersResponse = {
  cycle: { id: string; startedAt: string; finishedAt: string | null };
  papers: Array<{
    id: string;
    title: string;
    authors: string[];
    publishedAt: string;          // ISO-8601
    fetchedAt: string;            // ISO-8601
    matchedTopics: { id: string; name: string }[];   // length >= 1
    summary:
      | { status: "SUCCEEDED"; bullets: string[] }
      | { status: "PENDING_RETRY" | "NOT_SUMMARISABLE" | "ABSENT" };  // no bullets
    detailUrl: string;            // relative, e.g. "/papers/<id>" — route to your 003 detail view
  }>;
  nextCursor: string | null;      // null on the last page
};
```

- **Ordering matches the email**: `publishedAt DESC`, then `fetchedAt DESC`, then `id ASC`. The first three rows are exactly the three papers shown in the digest, in the same order — so the page feels continuous from inbox to web.
- `summary.bullets` is present **only** when `status === "SUCCEEDED"`. For any other status, render a "summary not yet available" placeholder (same convention as the email and the `003` detail view).
- `detailUrl` is relative (`/papers/<id>`); link it to your existing `003` paper-detail route.

**404 handling:** returned when the cycle doesn't exist **or** produced no papers for this user — bodies are identical (no cross-user disclosure). Render a friendly "Nothing to show for this batch" state rather than a hard error; a logged-in user arriving from an old email link is the common case.

**Empty-state copy suggestion:** *"This batch has no papers in your topics anymore — topics may have changed since the email was sent."*

---

## 5. Unsubscribe (US3) — mostly backend-owned

The digest footer links to `${PUBLIC_API_BASE_URL}/api/notifications/unsubscribe?token=…`. Clicking it:

- Flips the user's preference to **off** (no login required; the HMAC token authorises it).
- Returns a minimal **backend-rendered HTML confirmation page** (`Content-Type: text/html`).

**You do not need to build anything for the default flow.** It works standalone.

**Optional polish (later):** if you want the unsubscribe confirmation to match your design system, you can repoint the email footer at an FE route instead — but that requires a backend change to `EMAIL` link construction and is **out of scope for this iteration**. Coordinate with backend before doing this; don't try to intercept the current API URL from the frontend.

**Do not** call the unsubscribe endpoint from authenticated app code to implement the settings toggle — use `PUT /api/notifications/preference` (§3) for that. The unsubscribe endpoint exists only for the no-login email path.

---

## 6. Deep links the emails rely on (make sure these routes exist)

| Email link | Resolves to FE route | Provided by |
|---|---|---|
| Per-paper "Read on PaperHub" | `/papers/:id` | **`003`** (already exists) — just confirm it handles a cold, logged-out visitor by bouncing through login and returning to the URL. |
| "See more on PaperHub" | `/cycles/:cycleId` | **NEW — you build this** (see §4). |
| "Unsubscribe" | `…/api/notifications/unsubscribe` | Backend (no FE work). |

The critical net-new FE deliverables are: **(a)** the settings toggle (§3) and **(b)** the `/cycles/:cycleId` page (§4). Everything else is reuse or backend-owned.

---

## 7. End-to-end smoke (FE-side)

1. Log in. Open settings → flip the email toggle **on** → reload → it stays on.
2. Ask backend to run a fetch cycle (or wait for the scheduled one) with topics that match new papers.
3. Check the inbox (Mailpit in dev, see `gmail-smtp-setup.md` for a real inbox). The "See more" link should open your `/cycles/:cycleId` page and list the same first 3 papers plus the rest.
4. Click a paper → lands on your `003` `/papers/:id` detail view.
5. Click "Unsubscribe" in the email → backend confirmation page → reload settings → toggle now shows **off** with `lastChangedVia: "UNSUBSCRIBE_LINK"`.
