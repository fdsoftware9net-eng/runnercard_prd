#!/usr/bin/env node
/**
 * Runnable example: pushing bib-keyed corrections to RunnerPortal.
 *
 * For the Bangsaen10 runner-card / wallet system. Node 18+, no dependencies.
 *
 *   RP_KEY_ID=... RP_SECRET=... node wallet-edit-client.mjs --dry-run
 *
 * This is deliberately one file you can read in five minutes. The three things
 * worth copying exactly are: the canonical string, signing the RAW bytes you
 * actually send, and how the response is interpreted.
 */
import { createHmac, createHash, randomUUID } from 'node:crypto';

const BASE = process.env.RP_BASE_URL
  ?? 'https://runner-portal-partner-api-382283506828.asia-southeast3.run.app';
const KEY_ID = process.env.RP_KEY_ID;
const SECRET = process.env.RP_SECRET;
const DRY_RUN = process.argv.includes('--dry-run');

if (!KEY_ID || !SECRET) {
  console.error('Set RP_KEY_ID and RP_SECRET. Never hard-code the secret.');
  process.exit(2);
}

const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * The exact bytes that get signed:
 *
 *   METHOD \n path \n canonicalQuery \n timestamp \n nonce \n sha256hex(body)
 *
 * There is no query string on this endpoint, so that line is empty — but it is
 * still present. Dropping the empty line is the single most common signing bug.
 */
function canonicalString({ method, path, query, timestamp, nonce, body }) {
  return [method.toUpperCase(), path, query ?? '', timestamp, nonce, sha256Hex(body)].join('\n');
}

function sign(secret, parts) {
  return createHmac('sha256', secret).update(canonicalString(parts), 'utf8').digest('base64');
}

/**
 * ⚠️ `raw` is built ONCE and both signed and sent.
 *
 * Re-serialising the object for the request would be a different string —
 * JSON.stringify does not guarantee key order or spacing across versions — and
 * the signature would fail for a reason neither side can see in a log.
 */
async function postEdits(records, { dryRun = false, idempotencyKey } = {}) {
  const path = '/v1/registrations/edits';
  const raw = JSON.stringify({
    event: 'bangsaen10',
    year: 2026,
    dry_run: dryRun,
    records,
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID().replace(/-/g, '');

  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rp-key-id': KEY_ID,
      'x-rp-timestamp': timestamp,
      'x-rp-nonce': nonce,
      'x-rp-signature': sign(SECRET, {
        method: 'POST',
        path,
        query: '',
        timestamp,
        nonce,
        body: raw,
      }),
      // Required. Stable per logical batch, so a retry after a timeout replays
      // the original report instead of applying the batch a second time.
      'idempotency-key': idempotencyKey ?? randomUUID(),
    },
    body: raw,
  });

  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
// The edits you are pushing. Send ONLY the fields that changed — an omitted
// field is left alone, and an explicit null clears it.
// ---------------------------------------------------------------------------
const edits = [
  { bib_number: '10234', first_name: 'Somchart', shirt_size: 'L' },
  { bib_number: '10235', registration_status: 'cancelled' },
  { bib_number: '10236', phone: '0812345678' },
];

const { status, body } = await postEdits(edits, { dryRun: DRY_RUN });

// ---------------------------------------------------------------------------
// Interpreting the answer. The distinction that matters most is at the top.
// ---------------------------------------------------------------------------
if (status === 403 && body?.error === 'authority_moved') {
  // NOT an error. The organizer has moved to editing in RunnerPortal, as
  // agreed. Stop sending; do not retry; do not page anyone.
  console.log('Window closed — RunnerPortal is now the source of truth. Stopping.');
  process.exit(0);
}

if (status === 403) {
  // This one IS a problem: the key is misconfigured or scoped to another event.
  console.error('Forbidden — the key is wrong, not the timing. Contact RunnerPortal.');
  process.exit(1);
}

if (status !== 200) {
  console.error(`Refused (${status}):`, body);
  // 409 duplicate_bib_in_payload / idempotency_key_reused are bugs on this
  // side — retrying unchanged will fail identically.
  process.exit(1);
}

console.log(
  `${body.dry_run ? '[DRY RUN] ' : ''}` +
    `updated=${body.updated} unchanged=${body.unchanged} ` +
    `not_found=${body.not_found} ambiguous=${body.ambiguous} rejected=${body.rejected}`,
);

for (const r of body.results) {
  switch (r.outcome) {
    case 'updated':
      console.log(`  ✓ ${r.bib_number}: ${r.changed.join(', ')}`);
      if (r.overrides_cleared) {
        // A RunnerPortal admin had corrected this by hand and your value
        // replaced it. Worth surfacing to whoever is doing the editing.
        console.log(`      replaced an admin correction: ${r.overrides_cleared.join(', ')}`);
      }
      if (r.ignored) {
        // Your key may not write these. Usually a field-mapping mistake.
        console.log(`      ignored (not writable by this key): ${r.ignored.join(', ')}`);
      }
      break;
    case 'unchanged':
      break;
    case 'not_found':
      console.warn(`  ? ${r.bib_number}: no entry with this bib`);
      break;
    case 'ambiguous_bib':
      // Should not happen on Bangsaen10 2026 — tell RunnerPortal if it does.
      console.error(`  ! ${r.bib_number}: matches more than one entry`);
      break;
    case 'rejected':
      console.error(`  ✗ ${r.bib_number}: ${r.reason}`);
      break;
  }
}
