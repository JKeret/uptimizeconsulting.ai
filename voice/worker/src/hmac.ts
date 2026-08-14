// Verifies ElevenLabs' post-call webhook signature.
//
// Scheme (ported from lanefit/worker/src/hmac.ts, the corroborated
// implementation -- the official prose docs delegate this to the SDK's
// construct_event/constructEvent and don't print the byte-level format):
//   Header: `ElevenLabs-Signature: t=<unix_ts>,v0=<hex_hmac_sha256>`
//   Signed string: `${timestamp}.${rawBody}`
//   Algorithm: HMAC-SHA256, hex-encoded.
const SIGNATURE_HEADER_PREFIX_TIMESTAMP = "t=";
const SIGNATURE_HEADER_PREFIX_SIGNATURE = "v0=";

// Replay-window bounds: reject timestamps older than this (staleness) or
// further in the future than this (clock skew allowance).
const MAX_TIMESTAMP_AGE_SECONDS = 30 * 60;
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// A random key, generated once per isolate and reused for every call to
// `timingSafeEqualString` below. It never needs to be a secret itself --
// its only job is to map both comparison inputs onto fixed-length (32-byte)
// digests so the final comparison doesn't leak either input's length.
let compareKeyPromise: Promise<CryptoKey> | undefined;

function getCompareKey(): Promise<CryptoKey> {
  if (!compareKeyPromise) {
    compareKeyPromise = crypto.subtle.importKey(
      "raw",
      crypto.getRandomValues(new Uint8Array(32)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }
  return compareKeyPromise;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  // Both inputs are always 32-byte HMAC-SHA256 digests by construction
  // (see timingSafeEqualString), so this length check never itself leaks
  // anything about the original, pre-digest inputs.
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

/**
 * Constant-time equality for arbitrary UTF-8 strings -- e.g. a caller-
 * supplied shared-secret header compared against its expected value
 * (`index.ts`'s `X-Lab-Token` check). Unlike `timingSafeEqualHex` above
 * (which assumes two already-equal-length hex-encoded MACs and is only
 * used to compare a webhook signature against its locally recomputed
 * expected value), this handles variable-length, non-hex inputs safely: a
 * naive `a.length !== b.length` short-circuit -- or even a naive
 * charCode-XOR loop bounded by one string's length -- leaks the true
 * secret's length through both control flow and wall-clock time.
 *
 * Both inputs are first HMAC'd with a random key generated once per
 * isolate (`getCompareKey`); the two resulting digests are always 32 bytes
 * regardless of the inputs' original lengths, so the final byte-by-byte
 * comparison leaks neither a length mismatch nor any length-dependent
 * timing signal about the real secret.
 */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const key = await getCompareKey();
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(a)),
    crypto.subtle.sign("HMAC", key, new TextEncoder().encode(b)),
  ]);
  return timingSafeEqualBytes(new Uint8Array(macA), new Uint8Array(macB));
}

/**
 * Verifies the `ElevenLabs-Signature` header value against the raw request
 * body string.
 *
 * Also enforces a replay window: the `t=` timestamp must be no more than
 * 30 minutes old and no more than 5 minutes in the future (clock skew
 * allowance), otherwise a captured valid (body, signature) pair could be
 * replayed indefinitely. `nowSecs` is injectable for deterministic tests.
 */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSecs: number
): Promise<boolean> {
  if (!header || !secret) {
    return false;
  }

  const parts = header.split(",");
  const timestampPart = parts.find((p) => p.startsWith(SIGNATURE_HEADER_PREFIX_TIMESTAMP));
  const signatureCandidates = parts
    .filter((p) => p.startsWith(SIGNATURE_HEADER_PREFIX_SIGNATURE))
    .map((p) => p.slice(SIGNATURE_HEADER_PREFIX_SIGNATURE.length));
  if (!timestampPart || signatureCandidates.length === 0) {
    return false;
  }
  const timestamp = timestampPart.slice(SIGNATURE_HEADER_PREFIX_TIMESTAMP.length);

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  const age = nowSecs - timestampSeconds;
  if (age > MAX_TIMESTAMP_AGE_SECONDS || age < -MAX_TIMESTAMP_SKEW_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedHex = toHex(signatureBuffer);

  return signatureCandidates.some((candidate) => timingSafeEqualHex(candidate, expectedHex));
}
