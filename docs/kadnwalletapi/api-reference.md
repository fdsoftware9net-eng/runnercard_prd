# RunnerPortal Partner API — reference

**Version 1 · Status: phase 1 (outbound) and phase 2 (inbound) both built — inbound not yet enabled**
**Audience: Thairun engineering**

RunnerPortal holds the Bangsaen42 start list and lets race staff correct it at the
expo counter. This API lets your systems stay in step with those corrections
automatically, instead of a person re-typing each one into your web app.

| | |
|---|---|
| Base URL | `https://runner-portal-partner-api-382283506828.asia-southeast3.run.app` |
| Sandbox | **The same URL.** Sandbox is a property of your *key*, not a separate host — a sandbox key is scoped to a test event containing invented runners. |
| Transport | HTTPS only. Plain HTTP is refused, never redirected. |
| Content type | `application/json; charset=utf-8` |
| Region | `asia-southeast3` (Bangkok) |

> **Start with a sandbox key.** Sandbox and production are the same URL and the
> same code — what differs is the key: a sandbox key is scoped to a test event
> containing invented runners, so nothing you touch is real personal data and
> you can log freely while you build. Production keys are issued only after a
> sandbox run works.
>
> A friendlier hostname may be added later. If it is, this URL keeps working —
> but read it from this document rather than hard-coding it in more than one
> place.

---

## 1. What the API is for

Two directions. Only the first is live today.

**Outbound — you pull our corrections (live now).**
1. `GET /v1/changes` — corrections we have made that you have not yet applied.
2. You apply them in your system.
3. `POST /v1/changes/ack` — tell us you applied them, so they leave the queue.
4. `GET /v1/registrations` — the full current start list, whenever you want to
   check your copy is right.

**Inbound — you push registrations to us (built; not yet switched on).**
This replaces the CSV/XLSX file you send us today. The endpoint is implemented
and tested, but no key carries the `registrations:write` scope yet — so it will
answer `403` until we grant it. Build against §8 whenever you are ready, and
tell us when you want the scope enabled on your sandbox key.

---

## 2. Authentication

Every request except `GET /v1/health` is signed with HMAC-SHA256 using a shared
secret. We issue you a **key id** (public, identifies which key you used) and a
**secret** (never sent over the wire).

### 2.1 Headers

| Header | Meaning |
|---|---|
| `X-RP-Key-Id` | Your key id, e.g. `thairun-prod` |
| `X-RP-Timestamp` | Current time, **Unix seconds**, as a decimal string |
| `X-RP-Nonce` | A unique random string per request, 8–128 chars, `[A-Za-z0-9._~-]` |
| `X-RP-Signature` | Base64 HMAC-SHA256 of the canonical string, below |

### 2.2 The canonical string

Six lines joined with `\n` (line feed, `0x0A`), in this exact order:

```
<HTTP METHOD, uppercase>
<path, including /v1, no query string>
<canonical query string>
<X-RP-Timestamp>
<X-RP-Nonce>
<lowercase hex SHA-256 of the request body>
```

Then:

```
signature = base64( HMAC-SHA256( secret, canonical_string ) )
```

**Rules that matter — most integration bugs are one of these:**

1. **The timestamp is Unix seconds**, e.g. `1755500000`. Not RFC 3339. A
   timestamp has to hash to identical bytes on both sides, and `2026-08-18T09:33:20Z`
   has many equally-legal spellings; a number has one.
2. **The path includes `/v1`.** Sign `/v1/changes`, not `/changes`.
3. **The query string is rebuilt, not copied.** Sort parameters by name (then by
   value for repeats), percent-encode each name and value with RFC 3986, and join
   with `&`. Encode a space as `%20`, never `+`. Also encode `!`, `'`, `(`, `)`
   and `*` — JavaScript's `encodeURIComponent` leaves those alone and Python's
   `quote` does not, which is exactly the bug that passes your tests and then
   fails on one runner whose surname contains an apostrophe.
4. **Empty query = empty line.** Do not omit the line.
5. **Always hash the body, even when empty.** An empty body hashes to
   `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
6. **Hash the exact bytes you send.** Do not re-serialise the JSON before
   hashing — key order and spacing must match byte for byte.

### 2.3 Worked example — GET

Using the secret `ExampleSecretDoNotUse` (this is a documentation example; your
real secret is different).

Request: `GET /v1/changes?year=2026&event=bangsaen42&limit=100`

Canonical string (note the parameters are **sorted**, so `event` comes first even
though the URL had `year` first):

```
GET
/v1/changes
event=bangsaen42&limit=100&year=2026
1755500000
a1b2c3d4e5f6a7b8
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

```
X-RP-Signature: Qu+UZdM+smdlujDr/s0qiBBOwWArDcNcl4RhgFT5Yg8=
```

### 2.4 Worked example — POST

Request: `POST /v1/changes/ack`, body exactly:

```json
{"change_ids":["3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607"]}
```

Body SHA-256: `89ae3f5845c58170c81777c7aaed06ccfb8f8028dec566036b06d86ecd74ebb9`

Canonical string (third line is empty — no query parameters):

```
POST
/v1/changes/ack

1755500000
b2c3d4e5f6a7b8c9
89ae3f5845c58170c81777c7aaed06ccfb8f8028dec566036b06d86ecd74ebb9
```

```
X-RP-Signature: E9mHVKm6/7RhlEbAVhvQSVt8JQGWve8hsJxGzKiErgQ=
```

> **Check your implementation against these two before writing any endpoint
> code.** If you reproduce both signatures exactly, your signing is correct and
> every later problem is somewhere else. Runnable code is in
> [`samples/`](./samples/).

### 2.5 Timestamp window and nonces

- A request is accepted only if its timestamp is within **±300 seconds** of our
  clock. Keep your servers on NTP.
- A nonce may be used **once**. Reusing one is refused. Use a UUID or 16+ random
  bytes hex — never a counter that resets when your process restarts.
- Because of this, **you cannot retry by re-sending the identical request.** A
  retry needs a fresh timestamp, a fresh nonce and a fresh signature. Sign inside
  your retry loop, not before it. This is the second most common integration bug.

### 2.6 Key rotation

We can run two of your secrets at once for an agreed overlap. During it, requests
signed with either are accepted, so you switch when it suits you rather than at a
coordinated instant. Contact us to start a rotation; the old key stops working at
the end of the overlap, and we will tell you the date in advance.

---

## 3. Errors

| HTTP | `error` | Meaning |
|---|---|---|
| 400 | `malformed` | A required header is missing or badly formed |
| 400 | `invalid_cursor` | The `since` value is not one we issued |
| 400 | `invalid_limit` | `limit` is not a positive integer |
| 400 | `invalid_status` | `status` is not `pending` or `all` |
| 400 | `invalid_request` | Body failed validation; see `detail` |
| 401 | `unauthorized` | Signature, key or timestamp problem |
| 403 | `forbidden` | Your key is valid but lacks the scope for this endpoint |
| 403 | `authority_moved` | Bib-keyed edits are closed — see §9. Not an error on your side |
| 409 | `idempotency_key_reused` | Same `Idempotency-Key`, different body |
| 404 | `not_found` | No such endpoint |
| 429 | `rate_limited` | Too many requests; see `Retry-After` |
| 500 | `internal_error` | Our fault. Retry with backoff; tell us if it persists |
| 503 | `secret_unavailable` | Our fault — we could not load your key. Retry |

**`401` is deliberately vague.** We do not tell you whether a key is unknown,
revoked, expired or simply mis-signed, because that would let anyone probe which
keys exist. We log the precise reason on our side — if you are stuck on a 401,
send us the `request_id` from your logs and the timestamp, and we will read it
back to you.

**Never treat `503` or `500` as an authentication problem.** Those are ours.

---

## 4. `GET /v1/changes`

Corrections waiting for you. **Scope: `changes:read`.**

### Query parameters

| Name | Default | Meaning |
|---|---|---|
| `status` | `pending` | `pending` = not yet acked by you. `all` = including already-acked |
| `since` | — | Cursor from a previous response's `next_cursor` |
| `limit` | `100` | 1–500. Values above 500 are clamped |
| `all_fields` | `false` | Include fields we would normally filter out for your partner type |

### Response

```jsonc
{
  "items": [
    {
      "record_id": "TR-000123",              // YOUR record id — the join key
      "registration_id": "0b0e…",            // our internal id, stable
      "changes": [
        {
          "change_id": "3f2a1b4c-…",         // ack this exact id
          "field": "bib_number",
          "old_value": "1002",
          "new_value": "1502",
          "bib_change_kind": "reassignment", // or "typo_fix", or null
          "is_timing_critical": true,
          "reason": "Runner was handed a replacement bib at the expo",
          "changed_at": "2026-08-11T00:00:00.000Z"
        }
      ],
      "record": {                            // full current state of the entry
        "bib_number": "1502",
        "first_name": "Malee",
        "last_name": "Sooksai",
        "registration_status": "registered"
      }
    }
  ],
  "next_cursor": "MjAyNi0wOC0xMV…",
  "has_more": true,
  "fields": ["bib_number", "first_name", "last_name", "registration_status"]
}
```

### Things you must handle

**One item = one runner, with all their pending changes.** Apply them together.

**`record` lets you overwrite instead of patch.** Both are given so you can choose:
apply `changes` field by field, or just overwrite your row from `record`. If you
ever suspect drift, `record` is authoritative.

**An entry can appear on two consecutive pages.** Paging is over individual
changes, so a runner whose changes straddle a page boundary appears twice, each
time with that page's changes. Treat every item as an **upsert**, never an insert.
Nothing is lost or double-counted, because you ack individual `change_id`s.

**🔴 `is_timing_critical: true` means act now.** It is set when a runner has been
physically handed a different bib (`bib_change_kind: "reassignment"`). The timing
chip must move with it. If this does not reach the timing system before the start
gun, **that runner records no time for the entire race.** Do not batch these
behind an overnight job.

**`bib_change_kind` distinguishes two things that look identical in the data:**
- `typo_fix` — our record had the wrong digits; the runner's physical bib never
  changed. Correct your copy. Not urgent.
- `reassignment` — the runner is physically holding a different bib now. The chip
  linkage moves. Urgent, as above.

**`fields` echoes what you were actually shown**, which is the field list agreed
for your key. If a field you expect is missing, that is a configuration matter —
contact us rather than working around it.

---

## 5. `POST /v1/changes/ack`

Tell us you have applied corrections. **Scope: `changes:ack`.**

```json
{ "change_ids": ["3f2a1b4c-…", "7d8e9f01-…"] }
```

Maximum 1000 ids per call. Duplicate ids in one batch are collapsed.

### Response — always `200` for a well-formed request

```jsonc
{
  "acked": 1,
  "results": [
    { "change_id": "3f2a1b4c-…", "status": "acked" },
    { "change_id": "7d8e9f01-…", "status": "already_acked" }
  ]
}
```

| `status` | Meaning |
|---|---|
| `acked` | Settled by this call |
| `already_acked` | Was already settled. **This is success, not an error** |
| `unknown` | No such change id |
| `forbidden` | That change belongs to an event your key does not cover |

**A partial batch is not a failure.** One unknown id among ninety-nine good ones
still returns 200 with the ninety-nine marked `acked`. Read `results`, do not
branch on the HTTP status alone.

**Retries are safe.** The write only fills an empty slot, so re-acking returns
`already_acked` and changes nothing. (Remember §2.5: a retry still needs a fresh
nonce and signature.)

### 🔴 What an ack means

**Ack AFTER you have applied the change, never on receipt.**

An ack removes the correction from the queue our race staff watch. If you ack on
receipt and then fail to apply, we believe the runner's record is fixed, you have
the old value, and **nobody finds out** — there is no later check that would catch
it. The failure surfaces on race morning.

Concretely: write the change to your database, confirm the write succeeded, and
only then add the `change_id` to your next ack batch. If applying fails, do not
ack — we will offer it again on your next pull, which is exactly what should happen.

---

## 6. `GET /v1/registrations`

The current start list, for checking your copy or recovering from a bad state.
**Scope: `registrations:read`.**

| Parameter | Default | Meaning |
|---|---|---|
| `since` | — | Cursor from `next_cursor` |
| `limit` | `100` | 1–500 |
| `category` | all | One race category, e.g. `Run 42.195` |
| `include_inactive` | `false` | Include cancelled / transferred / deferred / no-show |

```jsonc
{
  "items": [
    { "record_id": "TR-000123", "registration_id": "0b0e…",
      "record": { "bib_number": "1502", "first_name": "Malee" } }
  ],
  "next_cursor": "…",
  "has_more": false,
  "fields": ["bib_number", "first_name"]
}
```

**Cancelled entries are excluded unless you ask.** The usual question is "who is
running", and silently receiving cancellations as if they were entries leads to
over-ordered shirts and printed bibs for people who will not come.

**This is not a substitute for the changes feed.** It tells you the current state
but not what changed, why, or whether a bib move is timing-critical. Use `/v1/changes`
for the daily loop and this for reconciliation.

---

## 7. Paging and rate limits

**Cursors are opaque.** Store `next_cursor` and send it back as `since`. Do not
parse or construct one — the format is not part of this contract and will change.

Loop until `has_more` is `false`. Persist the last `next_cursor` so the next run
resumes rather than re-reading everything.

If a cursor is rejected as `invalid_cursor`, do **not** silently restart from the
beginning — that re-pulls the whole start list. Log it and tell us.

**Rate limit: 120 requests per minute** per key by default, as a fixed window. On
`429`, wait the `Retry-After` seconds. Polling every 5 minutes is ample; there is
no benefit to polling faster than once a minute.

---

## 8. Phase 2 — inbound registration push (BUILT, NOT YET ENABLED)

> ⚠️ **Implemented and tested, but switched off.** Your key does not carry the
> `registrations:write` scope, so this endpoint answers `403` today. Ask us to
> enable it on your **sandbox** key when you are ready to build against it.
>
> It runs the **same import code as our file importer** — the rules below are
> not a re-description of that behaviour, they are that behaviour.

`POST /v1/registrations/import` — **Scope: `registrations:write`.**

```jsonc
{
  "event": "bangsaen42",
  "year": 2026,
  "mode": "upsert",            // or "snapshot"
  "dry_run": true,             // strongly recommended first
  "records": [
    { "source_record_id": "TR-000123", "bib_number": "1002",
      "first_name": "Malee", "last_name": "Sooksai",
      "category": "Run 42.195", "registration_status": "registered" }
  ]
}
```

- `source_record_id` is **required and must be stable for the life of an entry.**
  It is the key we match on. If it changes, we create a duplicate runner.
- **`Idempotency-Key` is a required header** (8–200 chars), not optional. A push
  that times out after we committed leaves you unable to tell whether it landed,
  and retrying would import twice. A retry with the same key replays the original
  report; the same key with a *different* payload is refused with `409`.
  Note this is separate from the nonce: a retry is deliberately not
  byte-identical, so replay protection does not cover it.
- `dry_run: true` returns the same report and writes nothing. Use it first, every
  time you change your export.

**Routing:** an event-year is **several races**, one per distance, so each record
routes by its `category` (e.g. `Run 42.195`). A record whose category matches no
race is rejected rather than guessed into one — putting a 10K runner into the
marathon start list corrupts the finish-what-you-registered-for rule that decides
whether their year counts toward a souvenir tier. If the event-year has only one
race, `category` may be omitted.

**Three things it will refuse, by design:**

1. **It will not overwrite a field our staff corrected at the expo.** Those fields
   are locked to us. If your value still disagrees, the report says so and a human
   decides — a fresh export the morning after the expo must not silently wipe a
   day of counter work. Expect `skipped_overridden` entries in the report and
   treat them as a to-do list on your side, not an error.
2. **It will not accept two registered runners on one bib.** The whole batch stops
   and the report names the collision.
3. **It will not blank a stored value because a column was missing** from your
   payload. Omitting a field means "no change". To clear a field, send it
   explicitly as `null`.

`mode: "snapshot"` reports entries we hold that your payload no longer contains,
but **never cancels them automatically.** Cancelling a runner is a decision a
person makes.


---

## 9. `POST /v1/registrations/edits` — corrections keyed by bib

**Scope: `registrations:edit`.** A separate scope from `registrations:write`,
and a separate endpoint from §8, because it matches on a different key.

Use this when your system holds **bib numbers** rather than our
`source_record_id` — for example a runner-card or wallet system, where the bib
is what is printed on the card. Each record names one entry by
`event` + `year` + `bib_number` and carries only the fields you want changed.

### The window

> 🔴 **This endpoint is open only while your system is the source of truth.**
>
> The organizer edits runners in your system up to an agreed cutover, and then
> moves to editing in RunnerPortal. From that moment every request here returns
> `403 { "error": "authority_moved" }` and **changes nothing**.
>
> That is the integration ending normally, not a fault. Treat `authority_moved`
> as "stop sending, as agreed" — do not retry it, do not page anyone, and do not
> confuse it with `forbidden`, which means your key was never allowed to do this
> and someone must fix the key.

### Request

`Idempotency-Key` header is **required** — see §8 for why.

```jsonc
{
  "event": "bangsaen10",
  "year": 2026,
  "dry_run": true,              // strongly recommended first
  "records": [
    { "bib_number": "10234", "first_name": "Somchart", "shirt_size": "L" },
    { "bib_number": "10235", "registration_status": "cancelled" }
  ]
}
```

### Omitted, null, and unreadable are three different things

This is the rule that matters most, and it differs from our file importer on
purpose — you are a program, not a spreadsheet, so we never guess on your behalf.

| You send | We do |
|---|---|
| field **absent** | leave it exactly as it is |
| field **`null`** | clear the column |
| a value we cannot read | **reject that record** and tell you why — we never store `null` because your value was unreadable |

`registration_status` is matched **exactly** against `registered`, `cancelled`,
`transferred`, `deferred`, `no_show`. Unrecognised wording is rejected, never
defaulted — a typo must not quietly reinstate a runner who withdrew.

### What you may not change

- **`bib_number`** is the key, never a value. A genuine bib move changes the
  timing-chip linkage and has to reach the timing partner before the gun, so it
  is a decision a person makes in RunnerPortal.
- **An ID card that already exists cannot be erased**, only corrected. Clearing
  it would drop the runner out of their own race history.
- **An edit may not leave a runner with no name** in any of the four name
  columns.
- Fields your key does not hold are **ignored, not fatal** — they come back in
  `ignored` so you can spot a mapping mistake.

### Response — always `200` for a well-formed request

Per-record outcomes. One bad record never discards the good ones.

```jsonc
{
  "dry_run": false,
  "batch_id": "…",
  "event": "bangsaen10", "year": 2026,
  "received": 3, "updated": 1, "unchanged": 1,
  "not_found": 1, "ambiguous": 0, "rejected": 0,
  "writable_fields": ["first_name", "last_name", "shirt_size", "…"],
  "results": [
    { "bib_number": "10234", "outcome": "updated",
      "changed": ["first_name"], "overrides_cleared": ["first_name"] },
    { "bib_number": "10235", "outcome": "unchanged" },
    { "bib_number": "99999", "outcome": "not_found" }
  ]
}
```

| `outcome` | Meaning |
|---|---|
| `updated` | Applied. `changed` lists the columns written |
| `unchanged` | We already held those values |
| `not_found` | No entry in this event carries that bib |
| `ambiguous_bib` | More than one entry carries it — we refuse rather than guess. Tell us |
| `rejected` | See `reason`. That record only |

`overrides_cleared` names fields a RunnerPortal admin had corrected by hand that
your value has now replaced. It is reported so the organizer can see their
correction no longer stands.

### Whole-request refusals

These return non-`200` and change nothing at all:

| HTTP | Meaning |
|---|---|
| `400 invalid_request` | Body failed validation; see `detail` |
| `403 authority_moved` | The window is closed — see above |
| `403 forbidden` | Your key lacks `registrations:edit`, or names an event or year it is not scoped to |
| `409` with `duplicate_bib_in_payload` | One bib appears twice in a payload; order would decide the winner, so we refuse |
| `409 idempotency_key_reused` | Same key, different body |

### Things you must handle

- **Send `dry_run: true` first** on any batch you have not sent before. It
  produces the identical report and writes nothing.
- **Cap batches at 5,000 records.** If you are regularly near that, you are
  re-sending the start list rather than corrections — talk to us.
- **Never retry a `403`.** Both meanings of it are settled by a human, not by
  waiting.

---

## 10. Getting started

1. Tell us the source IP range your servers will call from, and a technical
   contact.
2. We issue a **sandbox** key id and secret. The secret is shown once — store it
   in your secret manager, not in source control.
3. Reproduce the two worked signatures in §2.3 and §2.4.
4. Run the sandbox loop: pull → apply → ack → pull again and confirm the queue is
   empty.
5. Tell us, and we issue production keys.

**Support:** include the `request_id` from your logs, the UTC timestamp, the
endpoint, and your key id. Never send us your secret — if you believe it has
leaked, say so and we will revoke it immediately.

**Related documents**
- [`integration-guide-TH.md`](./integration-guide-TH.md) — คู่มือภาษาไทย
- [`data-dictionary.md`](./data-dictionary.md) — every field, meaning and mapping
- [`security-pdpa.md`](./security-pdpa.md) — keys, logging, personal-data terms
- [`openapi.yaml`](./openapi.yaml) — machine-readable spec
- [`samples/`](./samples/) — runnable Node and Python signing code
