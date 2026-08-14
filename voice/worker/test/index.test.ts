import { describe, it, expect } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/index";

const SECRET = "whsec_routing_test";

async function sign(body: string, secret: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${ts},v0=${hex}`;
}

function payload() {
  return JSON.stringify({
    type: "post_call_transcription",
    data: {
      conversation_id: "conv_routing",
      analysis: { transcript_summary: "Routing test call.", data_collection_results: {} },
    },
  });
}

// All sinks left unconfigured so the fan-out is a clean no-op (no network
// calls) and the routing test stays isolated from sinks.test.ts's concerns.
function testEnv(): Env {
  return {
    ELEVENLABS_WEBHOOK_SECRET: SECRET,
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
  };
}

// Minimal ExecutionContext stub that captures whatever gets handed to
// waitUntil so a test can await it instead of racing the background work.
function testCtx() {
  const waited: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      waited.push(p);
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
  return { ctx, waited };
}

describe("worker routing", () => {
  it("returns 401 for a bad signature on POST /postcall", async () => {
    const body = payload();
    const request = new Request("https://voice.example.com/postcall", {
      method: "POST",
      headers: { "ElevenLabs-Signature": "t=1,v0=deadbeef" },
      body,
    });

    const res = await worker.fetch(request, testEnv(), testCtx().ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 for the wrong path", async () => {
    const request = new Request("https://voice.example.com/not-postcall", { method: "POST", body: "{}" });
    const res = await worker.fetch(request, testEnv(), testCtx().ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a GET on /postcall", async () => {
    const request = new Request("https://voice.example.com/postcall", { method: "GET" });
    const res = await worker.fetch(request, testEnv(), testCtx().ctx);
    expect(res.status).toBe(404);
  });

  it("returns 200 for a validly signed POST /postcall and schedules delivery via waitUntil", async () => {
    const body = payload();
    const now = Math.floor(Date.now() / 1000);
    const signature = await sign(body, SECRET, now);
    const request = new Request("https://voice.example.com/postcall", {
      method: "POST",
      headers: { "ElevenLabs-Signature": signature },
      body,
    });

    const { ctx, waited } = testCtx();
    const res = await worker.fetch(request, testEnv(), ctx);
    expect(res.status).toBe(200);
    expect(waited).toHaveLength(1);
    // The scheduled delivery must resolve cleanly (no unhandled rejection)
    // even with every sink left unconfigured.
    await expect(waited[0]).resolves.toEqual({ netlify: false, telegram: false, crm: false });
  });

  it("returns 400 when the signature is valid but the body is not JSON", async () => {
    const body = "not-json";
    const now = Math.floor(Date.now() / 1000);
    const signature = await sign(body, SECRET, now);
    const request = new Request("https://voice.example.com/postcall", {
      method: "POST",
      headers: { "ElevenLabs-Signature": signature },
      body,
    });

    const res = await worker.fetch(request, testEnv(), testCtx().ctx);
    expect(res.status).toBe(400);
  });
});
