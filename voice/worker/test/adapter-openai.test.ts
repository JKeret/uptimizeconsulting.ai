import { describe, it, expect, vi, afterEach } from "vitest";
import { parseOpenAILab } from "../src/adapter-openai";
import worker from "../src/index";
import type { Env } from "../src/index";

// -- parseOpenAILab -------------------------------------------------------

function fixture(overrides: {
  summary?: string;
  fields?: Record<string, unknown>;
  transcript_url?: string;
}) {
  const { summary = "Caller wants a website redesign.", fields = {}, transcript_url = "https://lab.example.com/t/abc" } =
    overrides;
  return { summary, fields, transcript_url };
}

describe("parseOpenAILab", () => {
  it("maps a full payload to a complete Lead with brain openai-lab", () => {
    const payload = fixture({
      summary: "Wants a new site built.",
      transcript_url: "https://lab.example.com/t/full",
      fields: {
        name: "Jane Doe",
        business: "Doe Consulting",
        process: "Need a marketing site",
        callback_number: "+15551234567",
        email: "jane@doeconsulting.com",
        urgent: true,
        existing_client: false,
      },
    });

    const lead = parseOpenAILab(payload);

    expect(lead).toEqual({
      name: "Jane Doe",
      business: "Doe Consulting",
      process: "Need a marketing site",
      callback_number: "+15551234567",
      email: "jane@doeconsulting.com",
      urgent: true,
      existing_client: false,
      summary: "Wants a new site built.",
      transcript_url: "https://lab.example.com/t/full",
      source: "phone-intake",
      brain: "openai-lab",
    });
  });

  it("defaults missing fields to empty strings / false", () => {
    const payload = fixture({ summary: "", fields: {}, transcript_url: "" });

    const lead = parseOpenAILab(payload);

    expect(lead).toEqual({
      name: "",
      business: "",
      process: "",
      callback_number: "",
      email: "",
      urgent: false,
      existing_client: false,
      summary: "",
      transcript_url: "",
      source: "phone-intake",
      brain: "openai-lab",
    });
  });

  it("coerces boolean-ish strings to true for urgent/existing_client (reusing the EL adapter's helper)", () => {
    const payload = fixture({
      fields: { urgent: "true", existing_client: "yes" },
    });

    const lead = parseOpenAILab(payload);

    expect(lead.urgent).toBe(true);
    expect(lead.existing_client).toBe(true);
  });

  it("coerces non-truthy strings to false for urgent/existing_client", () => {
    const payload = fixture({
      fields: { urgent: "false", existing_client: "no" },
    });

    const lead = parseOpenAILab(payload);

    expect(lead.urgent).toBe(false);
    expect(lead.existing_client).toBe(false);
  });

  it("case-insensitively coerces TRUE/Yes", () => {
    const payload = fixture({
      fields: { urgent: "TRUE", existing_client: "Yes" },
    });

    const lead = parseOpenAILab(payload);

    expect(lead.urgent).toBe(true);
    expect(lead.existing_client).toBe(true);
  });

  it("never throws on a malformed payload (missing fields object entirely)", () => {
    expect(() => parseOpenAILab({})).not.toThrow();
    expect(() => parseOpenAILab(null)).not.toThrow();
    expect(parseOpenAILab({}).brain).toBe("openai-lab");
  });
});

// -- POST /lab/postcall route ----------------------------------------------

const LAB_TOKEN = "lab_token_test_value";

function labPayload() {
  return JSON.stringify(
    fixture({
      summary: "Lab route test call.",
      transcript_url: "https://lab.example.com/t/route-test",
      fields: {
        name: "Lab Caller",
        business: "Lab Co",
        process: "Testing the lab route",
        callback_number: "+15559990000",
        email: "lab@example.com",
        urgent: false,
        existing_client: false,
      },
    })
  );
}

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    ELEVENLABS_WEBHOOK_SECRET: "whsec_unused_here",
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
    LAB_TOKEN,
    ...overrides,
  };
}

// Minimal ExecutionContext stub that captures whatever gets handed to
// waitUntil so a test can await it instead of racing the background work
// (same pattern as index.test.ts).
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

describe("POST /lab/postcall route", () => {
  it("returns 401 when X-Lab-Token header is missing", async () => {
    const request = new Request("https://voice.example.com/lab/postcall", {
      method: "POST",
      body: labPayload(),
    });
    const res = await worker.fetch(request, baseEnv(), testCtx().ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 when X-Lab-Token header doesn't match env.LAB_TOKEN", async () => {
    const request = new Request("https://voice.example.com/lab/postcall", {
      method: "POST",
      headers: { "X-Lab-Token": "wrong-token" },
      body: labPayload(),
    });
    const res = await worker.fetch(request, baseEnv(), testCtx().ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 (route OFF) when env.LAB_TOKEN is unset, even if a header is sent", async () => {
    const request = new Request("https://voice.example.com/lab/postcall", {
      method: "POST",
      headers: { "X-Lab-Token": "anything-at-all" },
      body: labPayload(),
    });
    const res = await worker.fetch(request, baseEnv({ LAB_TOKEN: undefined }), testCtx().ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a GET on /lab/postcall", async () => {
    const request = new Request("https://voice.example.com/lab/postcall", { method: "GET" });
    const res = await worker.fetch(request, baseEnv(), testCtx().ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 when the token is valid but the body is not JSON", async () => {
    const request = new Request("https://voice.example.com/lab/postcall", {
      method: "POST",
      headers: { "X-Lab-Token": LAB_TOKEN },
      body: "not-json",
    });
    const res = await worker.fetch(request, baseEnv(), testCtx().ctx);
    expect(res.status).toBe(400);
  });

  describe("delivery on a valid request", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns 200 and delivers to Telegram only -- no Netlify/CRM calls -- for a lab lead", async () => {
      const calls: { url: string; init: RequestInit }[] = [];
      globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as unknown as typeof fetch;

      const request = new Request("https://voice.example.com/lab/postcall", {
        method: "POST",
        headers: { "X-Lab-Token": LAB_TOKEN },
        body: labPayload(),
      });

      const env = baseEnv({
        TELEGRAM_BOT_TOKEN: "bot_token_123",
        TELEGRAM_CHAT_ID: "chat_456",
        // Even if these sinks were configured, brain=openai-lab must fence
        // them off (Task 3's sinks already enforce this -- this test locks
        // it end-to-end through the route).
        NETLIFY_SITE_URL: "https://uptimizeconsulting.ai",
        CRM_BASE_URL: "https://crm.uptimizeconsulting.ai",
        CRM_EMAIL: "bot@uptimizeconsulting.ai",
        CRM_PASSWORD: "supersecret",
      });

      const { ctx, waited } = testCtx();
      const res = await worker.fetch(request, env, ctx);
      expect(res.status).toBe(200);
      expect(waited).toHaveLength(1);

      const result = await waited[0];
      expect(result).toEqual({ netlify: false, telegram: true, crm: false });

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.telegram.org/botbot_token_123/sendMessage");
      const body = JSON.parse(calls[0].init.body as string);
      expect(body.text).toContain("🧪 LAB");
      expect(body.text).toContain("Lab Caller");
    });
  });
});
