// Request signing for the RunnerPortal Partner API.
//
// Every request except GET /v1/health carries four headers, the last of which is
// an HMAC-SHA256 over a canonical string of exactly six lines:
//
//   <METHOD>\n<path incl. /v1>\n<canonical query>\n<unix seconds>\n<nonce>\n<sha256hex(body)>
//
// The two worked examples from api-reference.md 2.3 and 2.4 are kept here as
// DOC_VECTORS so the deployed function can prove its own signing is correct
// without anyone having to hold the real secret. RunnerPortal's own getting
// started guide asks for that check before any endpoint code is written.
//
// Three rules earn their own note because breaking them produces a 401 that no
// log on either side explains:
//
//   1. Sign the RAW bytes that go on the wire. Re-serialising the body first
//      changes key order or spacing and the signature no longer matches.
//   2. A nonce may be used once, so a retry is a NEW signature — call
//      signedHeaders() inside the retry loop, never before it.
//   3. The query line is present even when empty. Dropping the blank line is
//      the single most common mistake.

const encoder = new TextEncoder();

/** SHA-256 of the empty body, which still has to be hashed and signed. */
export const EMPTY_BODY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export type QueryParams =
  | Record<string, string | number>
  | Array<[string, string | number]>;

export interface CanonicalParts {
  method: string;
  /** Path including the /v1 prefix, no query string. */
  path: string;
  query?: QueryParams;
  timestamp: number | string;
  nonce: string;
  body?: Uint8Array | string;
}

/**
 * Percent-encode per RFC 3986.
 *
 * encodeURIComponent leaves ! ' ( ) * alone; RFC 3986 does not. Without this
 * correction a runner whose surname contains an apostrophe signs differently
 * here than on RunnerPortal's side — a bug that passes every test until the one
 * name that triggers it. (~ is unreserved and correctly left alone already,
 * which is the mirror-image correction the Python sample has to make.)
 */
export function rfc3986(value: string | number): string {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Rebuild the query string rather than copying it: sorted by name then value,
 * each part percent-encoded, joined with '&'. Sorting is by code unit, not by
 * locale — Intl collation would reorder some pairs and break the signature.
 */
export function canonicalQuery(params?: QueryParams): string {
  if (!params) return '';
  const pairs: Array<[string, string]> = (
    Array.isArray(params) ? params : Object.entries(params)
  ).map(([k, v]) => [String(k), String(v)]);

  pairs.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });

  return pairs.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join('&');
}

export async function sha256Hex(body: Uint8Array | string): Promise<string> {
  const bytes = typeof body === 'string' ? encoder.encode(body) : body;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function canonicalString(parts: CanonicalParts): Promise<string> {
  return [
    parts.method.toUpperCase(),
    parts.path,
    canonicalQuery(parts.query),
    String(parts.timestamp),
    parts.nonce,
    await sha256Hex(parts.body ?? ''),
  ].join('\n');
}

export async function hmacSha256Base64(
  secret: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  let binary = '';
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 32 hex chars, well inside the 8-128 range, and never a restartable counter. */
export function newNonce(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export interface SignRequestOptions extends Omit<CanonicalParts, 'timestamp' | 'nonce'> {
  keyId: string;
  secret: string;
  /** Only for reproducing fixed test vectors; live calls must use the clock. */
  timestamp?: number;
  nonce?: string;
}

/**
 * The four auth headers for one attempt.
 *
 * Call this per attempt. The timestamp is only accepted within +/-300s of
 * RunnerPortal's clock and a nonce is single-use, so a retry that re-sends
 * identical headers is refused by design.
 */
export async function signedHeaders(
  options: SignRequestOptions,
): Promise<Record<string, string>> {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? newNonce();
  const canonical = await canonicalString({
    method: options.method,
    path: options.path,
    query: options.query,
    timestamp,
    nonce,
    body: options.body,
  });

  return {
    'X-RP-Key-Id': options.keyId,
    'X-RP-Timestamp': String(timestamp),
    'X-RP-Nonce': nonce,
    'X-RP-Signature': await hmacSha256Base64(options.secret, canonical),
  };
}

// ---------------------------------------------------------------------------
// Self-check against the published worked examples.
//
// The secret below is the documentation's own throwaway value, not ours, so
// this check runs anywhere without touching the real key.
// ---------------------------------------------------------------------------

const DOC_SECRET = 'ExampleSecretDoNotUse';

export const DOC_VECTORS: Array<{
  name: string;
  parts: CanonicalParts;
  expected: string;
}> = [
  {
    name: 'api-reference.md 2.3 - GET /v1/changes',
    parts: {
      method: 'GET',
      path: '/v1/changes',
      query: { year: '2026', event: 'bangsaen42', limit: '100' },
      timestamp: 1755500000,
      nonce: 'a1b2c3d4e5f6a7b8',
      body: '',
    },
    expected: 'Qu+UZdM+smdlujDr/s0qiBBOwWArDcNcl4RhgFT5Yg8=',
  },
  {
    name: 'api-reference.md 2.4 - POST /v1/changes/ack',
    parts: {
      method: 'POST',
      path: '/v1/changes/ack',
      timestamp: 1755500000,
      nonce: 'b2c3d4e5f6a7b8c9',
      body: '{"change_ids":["3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607"]}',
    },
    expected: 'E9mHVKm6/7RhlEbAVhvQSVt8JQGWve8hsJxGzKiErgQ=',
  },
];

export interface VectorResult {
  name: string;
  canonical: string;
  expected: string;
  got: string;
  match: boolean;
}

/** Reproduce both documented signatures. Everything else depends on this. */
export async function verifyDocVectors(): Promise<VectorResult[]> {
  const results: VectorResult[] = [];
  for (const vector of DOC_VECTORS) {
    const canonical = await canonicalString(vector.parts);
    const got = await hmacSha256Base64(DOC_SECRET, canonical);
    results.push({
      name: vector.name,
      canonical,
      expected: vector.expected,
      got,
      match: got === vector.expected,
    });
  }
  return results;
}
