#!/usr/bin/env python3
"""
RunnerPortal Partner API — request signing in Python (3.8+, standard library only).

Run it with no arguments to check your understanding against the worked examples
in api-reference.md §2.3 and §2.4:

    python3 sign.py

If both print MATCH, your signing is correct and any later problem is elsewhere.
"""
import hashlib
import hmac
import base64
import time
import uuid
from urllib.parse import quote


def rfc3986(value: str) -> str:
    """
    Percent-encode per RFC 3986.

    safe="~" matters: Python's quote() treats ~ as unsafe by default while
    JavaScript's encodeURIComponent leaves it alone. Without this the two
    languages produce different signatures for any value containing a tilde —
    the mirror image of the ! ' ( ) * problem that JavaScript has and Python
    does not. Each language needs one correction, in opposite directions.
    """
    return quote(str(value), safe="~")


def canonical_query(params) -> str:
    """
    Sorted by key, then value, then percent-encoded and joined with '&'.

    Accepts a dict or an iterable of pairs. Sorting means parameter order in
    your URL cannot change the signature.
    """
    pairs = list(params.items()) if hasattr(params, "items") else list(params)
    pairs.sort(key=lambda kv: (str(kv[0]), str(kv[1])))
    return "&".join(f"{rfc3986(k)}={rfc3986(v)}" for k, v in pairs)


def canonical_string(method, path, params, timestamp, nonce, body=b"") -> str:
    """The exact six lines that get signed."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return "\n".join([
        method.upper(),
        path,                                   # includes /v1
        canonical_query(params),                # empty string if no params
        str(timestamp),                         # unix SECONDS
        nonce,
        hashlib.sha256(body).hexdigest(),       # hash even an empty body
    ])


def sign(secret: str, canonical: str) -> str:
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii")


def signed_headers(key_id, secret, method, path, params=None, body=b""):
    """
    Build the four headers.

    ⚠️ CALL THIS INSIDE YOUR RETRY LOOP. A nonce may be used once, so resending
    an identical request is always refused — each attempt needs a fresh
    timestamp, nonce and signature.
    """
    params = params or {}
    timestamp = int(time.time())
    nonce = uuid.uuid4().hex
    canonical = canonical_string(method, path, params, timestamp, nonce, body)
    return {
        "X-RP-Key-Id": key_id,
        "X-RP-Timestamp": str(timestamp),
        "X-RP-Nonce": nonce,
        "X-RP-Signature": sign(secret, canonical),
    }


if __name__ == "__main__":
    SECRET = "ExampleSecretDoNotUse"

    # --- api-reference.md §2.3 — GET -------------------------------------
    get_canonical = canonical_string(
        "GET",
        "/v1/changes",
        {"event": "bangsaen42", "year": "2026", "limit": "100"},
        1755500000,
        "a1b2c3d4e5f6a7b8",
        b"",
    )
    got = sign(SECRET, get_canonical)
    expected = "Qu+UZdM+smdlujDr/s0qiBBOwWArDcNcl4RhgFT5Yg8="
    print("GET  canonical:", repr(get_canonical))
    print("GET  signature:", got)
    print("GET  ->", "MATCH" if got == expected else f"MISMATCH (expected {expected})")

    # --- api-reference.md §2.4 — POST ------------------------------------
    body = b'{"change_ids":["3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607"]}'
    post_canonical = canonical_string(
        "POST", "/v1/changes/ack", {}, 1755500000, "b2c3d4e5f6a7b8c9", body
    )
    got = sign(SECRET, post_canonical)
    expected = "E9mHVKm6/7RhlEbAVhvQSVt8JQGWve8hsJxGzKiErgQ="
    print()
    print("POST canonical:", repr(post_canonical))
    print("POST signature:", got)
    print("POST ->", "MATCH" if got == expected else f"MISMATCH (expected {expected})")
