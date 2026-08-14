import { describe, it, expect } from "vitest";
import { verifySignature, timingSafeEqualString } from "../src/hmac";

async function sign(body: string, secret: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${ts},v0=${hex}`;
}

describe("verifySignature", () => {
  const body = '{"ok":true}'; const secret = "whsec_test"; const now = 1_760_000_000;
  it("accepts a valid signature", async () => {
    expect(await verifySignature(body, await sign(body, secret, now), secret, now)).toBe(true);
  });
  it("rejects a tampered body", async () => {
    expect(await verifySignature('{"ok":false}', await sign(body, secret, now), secret, now)).toBe(false);
  });
  it("rejects a stale timestamp", async () => {
    expect(await verifySignature(body, await sign(body, secret, now - 31 * 60), secret, now)).toBe(false);
  });
  it("rejects a missing header", async () => {
    expect(await verifySignature(body, null, secret, now)).toBe(false);
  });
});

describe("timingSafeEqualString", () => {
  it("returns true for identical strings", async () => {
    expect(await timingSafeEqualString("lab_token_abc123", "lab_token_abc123")).toBe(true);
  });
  it("returns false for different strings of the same length", async () => {
    expect(await timingSafeEqualString("lab_token_abc123", "lab_token_abc124")).toBe(false);
  });
  it("returns false for strings of different lengths", async () => {
    expect(await timingSafeEqualString("short", "a-much-longer-value")).toBe(false);
  });
  it("returns true for two empty strings", async () => {
    expect(await timingSafeEqualString("", "")).toBe(true);
  });
  it("returns false when only one side is empty", async () => {
    expect(await timingSafeEqualString("", "nonempty")).toBe(false);
  });
});
