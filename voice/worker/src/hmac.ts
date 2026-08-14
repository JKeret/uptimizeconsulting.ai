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
