import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { netlifySink, telegramSink, crmSink, deliverLead } from "../src/sinks";
import type { Lead } from "../src/contract";
import type { Env } from "../src/index";

// -- Fixtures ----------------------------------------------------------

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    name: "Jane Doe",
    business: "Doe Consulting",
    process: "Need a marketing site",
    callback_number: "+15551234567",
    email: "jane@doeconsulting.com",
    urgent: false,
    existing_client: false,
    call_type: "lead",
    message: "",
    summary: "Wants a new site built.",
    transcript_url: "https://elevenlabs.io/app/agents/history/conv_full",
    source: "phone-intake",
    brain: "elevenlabs",
    ...overrides,
  };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ELEVENLABS_WEBHOOK_SECRET: "whsec_test",
    TELEGRAM_BOT_TOKEN: "bot_token_123",
    TELEGRAM_CHAT_ID: "chat_456",
    NETLIFY_SITE_URL: "https://uptimizeconsulting.ai",
    CRM_BASE_URL: "https://crm.uptimizeconsulting.ai",
    CRM_EMAIL: "bot@uptimizeconsulting.ai",
    CRM_PASSWORD: "supersecret",
    CRM_LEAD_SOURCE_ID: "lead-source-id",
    CF_ACCESS_CLIENT_ID: "cf-id",
    CF_ACCESS_CLIENT_SECRET: "cf-secret",
    ...overrides,
  };
}

// -- Mock fetch: queues responses, records every call in order ---------

interface MockResponseSpec {
  ok: boolean;
  status?: number;
  // "set-cookie" may be a single string or an array -- real fetch responses
  // can carry multiple Set-Cookie headers, which is exactly the case
  // getSetCookie() (vs. the lossy headers.get) exists to handle correctly.
  headers?: Record<string, string | string[]>;
  json?: () => Promise<unknown>;
}

interface CapturedCall {
  url: string;
  init: { method?: string; headers?: Record<string, string>; body?: string };
}

function createMockFetch(responses: MockResponseSpec[]) {
  const calls: CapturedCall[] = [];
  let i = 0;
  const fetchImpl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as CapturedCall["init"] });
    const spec = responses[i++];
    if (!spec) {
      throw new Error(`mock fetch invoked more times than expected (call #${i}): ${String(url)}`);
    }
    const setCookie = spec.headers?.["set-cookie"];
    const setCookieArray = setCookie === undefined ? [] : Array.isArray(setCookie) ? setCookie : [setCookie];
    return {
      ok: spec.ok,
      status: spec.status ?? (spec.ok ? 200 : 500),
      headers: {
        get: (name: string) => {
          const v = spec.headers?.[name.toLowerCase()];
          if (v === undefined) return null;
          return Array.isArray(v) ? v.join(", ") : v;
        },
        getSetCookie: () => setCookieArray,
      },
      json: async () => (spec.json ? await spec.json() : {}),
      text: async () => "",
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function body(call: CapturedCall): Record<string, unknown> {
  return JSON.parse(call.init.body as string);
}

function formBody(call: CapturedCall): URLSearchParams {
  return new URLSearchParams(call.init.body as string);
}

// -- netlifySink ---------------------------------------------------------

describe("netlifySink spam-queue rescue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const rescueEnv = () =>
    makeEnv({ NETLIFY_API_TOKEN: "nf_token", NETLIFY_FORM_ID: "form123" });

  it("marks phone-intake spam entries as ham, leaves others alone", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: true }, // form POST
      {
        ok: true, // spam-queue list
        json: async () => [
          { id: "sub_phone", data: { source: "phone-intake" } },
          { id: "sub_other", data: { source: "web" } },
          { id: "sub_nodata" },
        ],
      },
      { ok: true }, // ham PUT for sub_phone only
    ]);

    const pending = netlifySink(makeLead(), rescueEnv(), fetchImpl);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toBe(true);

    expect(calls).toHaveLength(3);
    expect(calls[1].url).toBe(
      "https://api.netlify.com/api/v1/forms/form123/submissions?state=spam&per_page=20"
    );
    expect(calls[2].url).toBe("https://api.netlify.com/api/v1/submissions/sub_phone/ham");
    expect(calls[2].init.method).toBe("PUT");
    expect(calls[2].init.headers?.["Authorization"]).toBe("Bearer nf_token");
  });

  it("retries a failed sweep and never fails the sink when all attempts error", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: true }, // form POST
      { ok: false, status: 500 }, // sweep attempt 1: list fails
      { ok: false, status: 404 }, // sweep attempt 2: list fails (e.g. CF 1042)
      { ok: false, status: 500 }, // sweep attempt 3: list fails
    ]);

    const pending = netlifySink(makeLead(), rescueEnv(), fetchImpl);
    await vi.advanceTimersByTimeAsync(9000);
    expect(await pending).toBe(true);
    expect(calls).toHaveLength(4);
  });

  it("recovers on a retry after a transient list failure", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: true }, // form POST
      { ok: false, status: 404 }, // sweep attempt 1: transient edge failure
      {
        ok: true, // sweep attempt 2: list succeeds
        json: async () => [{ id: "sub_phone", data: { source: "phone-intake" } }],
      },
      { ok: true }, // ham PUT succeeds -> done, no third attempt
    ]);

    const pending = netlifySink(makeLead(), rescueEnv(), fetchImpl);
    await vi.advanceTimersByTimeAsync(9000);
    expect(await pending).toBe(true);
    expect(calls).toHaveLength(4);
    expect(calls[3].url).toBe("https://api.netlify.com/api/v1/submissions/sub_phone/ham");
  });

  it("skips the rescue entirely without NETLIFY_API_TOKEN", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    expect(await netlifySink(makeLead(), makeEnv(), fetchImpl)).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("netlifySink", () => {
  it("posts a urlencoded form to NETLIFY_SITE_URL", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    const result = await netlifySink(makeLead(), makeEnv(), fetchImpl);

    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://uptimizeconsulting.ai/");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");

    const form = formBody(calls[0]);
    expect(form.get("form-name")).toBe("starter-project");
    expect(form.get("name")).toBe("Jane Doe");
    expect(form.get("email")).toBe("jane@doeconsulting.com");
    expect(form.get("phone")).toBe("+15551234567");
    expect(form.get("business")).toBe("Doe Consulting");
    expect(form.get("process")).toBe("Need a marketing site");
    expect(form.get("source")).toBe("phone-intake");
  });

  it("skips (no fetch call) for message calls", async () => {
    const { fetchImpl, calls } = createMockFetch([]);
    const result = await netlifySink(makeLead({ call_type: "message" }), makeEnv(), fetchImpl);
    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("skips (no fetch call) for openai-lab leads", async () => {
    const { fetchImpl, calls } = createMockFetch([]);
    const result = await netlifySink(makeLead({ brain: "openai-lab" }), makeEnv(), fetchImpl);

    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("skips (no fetch call) when NETLIFY_SITE_URL is unset", async () => {
    const { fetchImpl, calls } = createMockFetch([]);
    const result = await netlifySink(makeLead(), makeEnv({ NETLIFY_SITE_URL: undefined }), fetchImpl);

    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("throws on a non-ok response", async () => {
    const { fetchImpl } = createMockFetch([{ ok: false, status: 500 }]);
    await expect(netlifySink(makeLead(), makeEnv(), fetchImpl)).rejects.toThrow(/Netlify/);
  });
});

// -- telegramSink ----------------------------------------------------------

describe("telegramSink", () => {
  it("posts to the Telegram sendMessage API with chat_id and text", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    const result = await telegramSink(makeLead(), makeEnv(), fetchImpl);

    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.telegram.org/botbot_token_123/sendMessage");
    const payload = body(calls[0]);
    expect(payload.chat_id).toBe("chat_456");
    const text = payload.text as string;
    expect(text).toContain("Wants a new site built.");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Doe Consulting");
    expect(text).toContain("Need a marketing site");
    expect(text).toContain("+15551234567");
    expect(text).toContain("jane@doeconsulting.com");
    expect(text).toContain("https://elevenlabs.io/app/agents/history/conv_full");
  });

  it("prefixes text with URGENT when lead.urgent", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    await telegramSink(makeLead({ urgent: true }), makeEnv(), fetchImpl);
    expect((body(calls[0]).text as string).startsWith("🔴 URGENT")).toBe(true);
  });

  it("prefixes text with EXISTING CLIENT when lead.existing_client", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    await telegramSink(makeLead({ existing_client: true }), makeEnv(), fetchImpl);
    expect((body(calls[0]).text as string).startsWith("🔴 EXISTING CLIENT")).toBe(true);
  });

  it("renders a MESSAGE FOR JONATHAN ping with the message body and no Process line", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    await telegramSink(
      makeLead({ call_type: "message", message: "Call me about the payroll demo.", business: "PayrollCo", process: "" }),
      makeEnv(),
      fetchImpl
    );
    const text = body(calls[0]).text as string;
    expect(text.startsWith("📝 MESSAGE FOR JONATHAN")).toBe(true);
    expect(text).toContain("Message: Call me about the payroll demo.");
    expect(text).toContain("Company: PayrollCo");
    expect(text).not.toContain("Process:");
  });

  it("prefixes text with LAB when brain is openai-lab", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    await telegramSink(makeLead({ brain: "openai-lab" }), makeEnv(), fetchImpl);
    expect((body(calls[0]).text as string).startsWith("🧪 LAB")).toBe(true);
  });

  it("skips (no fetch call) when TELEGRAM_BOT_TOKEN/CHAT_ID are unset", async () => {
    const { fetchImpl, calls } = createMockFetch([]);
    const result = await telegramSink(
      makeLead(),
      makeEnv({ TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" }),
      fetchImpl
    );
    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("throws on a non-ok response", async () => {
    const { fetchImpl } = createMockFetch([{ ok: false, status: 400 }]);
    await expect(telegramSink(makeLead(), makeEnv(), fetchImpl)).rejects.toThrow(/Telegram/);
  });
});

// -- crmSink -----------------------------------------------------------

describe("crmSink", () => {
  it("logs in with CF Access + Origin headers at /api/auth/login, then creates a lead at /api/leads carrying every session cookie", async () => {
    const { fetchImpl, calls } = createMockFetch([
      {
        ok: true,
        headers: {
          // Real login sets two: the app's session cookie AND Cloudflare
          // Access's own CF_Authorization cookie (confirmed live, Task 4).
          "set-cookie": ["crm_session=abc123; Path=/; HttpOnly", "CF_Authorization=xyz; Path=/; HttpOnly"],
        },
      },
      { ok: true, json: async () => ({ id: "lead-1" }) },
    ]);

    const result = await crmSink(makeLead(), makeEnv(), fetchImpl);
    expect(result).toBe(true);
    expect(calls).toHaveLength(2);

    // Login request
    expect(calls[0].url).toBe("https://crm.uptimizeconsulting.ai/api/auth/login");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers?.["CF-Access-Client-Id"]).toBe("cf-id");
    expect(calls[0].init.headers?.["CF-Access-Client-Secret"]).toBe("cf-secret");
    expect(calls[0].init.headers?.Origin).toBe("https://crm.uptimizeconsulting.ai");
    const loginBody = body(calls[0]);
    expect(loginBody.email).toBe("bot@uptimizeconsulting.ai");
    expect(loginBody.password).toBe("supersecret");

    // Lead-create request
    expect(calls[1].url).toBe("https://crm.uptimizeconsulting.ai/api/leads");
    expect(calls[1].init.headers?.["CF-Access-Client-Id"]).toBe("cf-id");
    expect(calls[1].init.headers?.["CF-Access-Client-Secret"]).toBe("cf-secret");
    expect(calls[1].init.headers?.Origin).toBe("https://crm.uptimizeconsulting.ai");
    expect(calls[1].init.headers?.Cookie).toBe("crm_session=abc123; CF_Authorization=xyz");
    expect(calls[1].init.headers?.Authorization).toBeUndefined();
    const leadBody = body(calls[1]);
    expect(leadBody.title).toBeUndefined();
    expect(leadBody.source).toBeUndefined();
    expect(leadBody.name).toBe("Jane Doe");
    expect(leadBody.email).toBe("jane@doeconsulting.com");
    expect(leadBody.phone).toBe("+15551234567");
    expect(leadBody.company).toBe("Doe Consulting");
    expect(leadBody.sourceId).toBe("lead-source-id");
    expect(leadBody.notes as string).toContain("Phone intake — Jane Doe");
    expect(leadBody.notes as string).toContain("Wants a new site built.");
    expect(leadBody.notes as string).toContain("Need a marketing site");
    expect(leadBody.notes as string).toContain("https://elevenlabs.io/app/agents/history/conv_full");
  });

  it("falls back to callback_number in the name/notes header when name is blank", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }, { ok: true }]);
    await crmSink(makeLead({ name: "" }), makeEnv(), fetchImpl);
    expect(body(calls[1]).name).toBe("+15551234567");
    expect(body(calls[1]).notes as string).toContain("Phone intake — +15551234567");
  });

  it("omits sourceId when CRM_LEAD_SOURCE_ID isn't configured", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }, { ok: true }]);
    await crmSink(makeLead(), makeEnv({ CRM_LEAD_SOURCE_ID: undefined }), fetchImpl);
    expect(body(calls[1]).sourceId).toBeUndefined();
  });

  it("skips (no fetch call) for message calls", async () => {
    const { fetchImpl, calls } = createMockFetch([]);
    const result = await crmSink(makeLead({ call_type: "message" }), makeEnv(), fetchImpl);
    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("skips (no fetch call) for openai-lab leads", async () => {
    const { fetchImpl, calls } = createMockFetch([]);
    const result = await crmSink(makeLead({ brain: "openai-lab" }), makeEnv(), fetchImpl);
    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("skips (no fetch call) when CRM vars are unset", async () => {
    const { fetchImpl, calls } = createMockFetch([]);
    const result = await crmSink(
      makeLead(),
      makeEnv({ CRM_BASE_URL: undefined, CRM_EMAIL: undefined, CRM_PASSWORD: undefined }),
      fetchImpl
    );
    expect(result).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("throws when login fails", async () => {
    const { fetchImpl } = createMockFetch([{ ok: false, status: 401 }]);
    await expect(crmSink(makeLead(), makeEnv(), fetchImpl)).rejects.toThrow(/login/i);
  });

  it("throws when lead-create fails", async () => {
    const { fetchImpl } = createMockFetch([
      { ok: true, headers: { "set-cookie": "crm_session=abc123" } },
      { ok: false, status: 500 },
    ]);
    await expect(crmSink(makeLead(), makeEnv(), fetchImpl)).rejects.toThrow(/lead/i);
  });
});

// -- deliverLead fan-out -------------------------------------------------

describe("deliverLead", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("delivers to all three sinks when everything succeeds", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: true }, // netlify
      { ok: true }, // telegram
      { ok: true, headers: { "set-cookie": "s=1" } }, // crm login
      { ok: true }, // crm create
    ]);

    const result = await deliverLead(makeLead(), makeEnv(), fetchImpl);

    expect(result).toEqual({ netlify: true, telegram: true, crm: true });
    expect(calls).toHaveLength(4); // no extra error ping
  });

  it("message calls go to Telegram only -- no netlify, no crm, no error ping", async () => {
    const { fetchImpl, calls } = createMockFetch([{ ok: true }]);
    const result = await deliverLead(makeLead({ call_type: "message", message: "hi" }), makeEnv(), fetchImpl);
    expect(result).toEqual({ netlify: false, telegram: true, crm: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.telegram.org");
  });

  it("lab leads skip netlify and crm without an error ping; telegram still fires with LAB prefix", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: true }, // telegram (only call made)
    ]);

    const result = await deliverLead(makeLead({ brain: "openai-lab" }), makeEnv(), fetchImpl);

    expect(result).toEqual({ netlify: false, telegram: true, crm: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.telegram.org");
    expect((body(calls[0]).text as string).startsWith("🧪 LAB")).toBe(true);
  });

  it("one sink throwing does not stop the others, and triggers one extra Telegram error ping", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: false, status: 500 }, // netlify fails
      { ok: true }, // telegram (lead notification) succeeds
      { ok: true, headers: { "set-cookie": "s=1" } }, // crm login
      { ok: true }, // crm create
      { ok: true }, // extra telegram error ping
    ]);

    const result = await deliverLead(makeLead(), makeEnv(), fetchImpl);

    expect(result).toEqual({ netlify: false, telegram: true, crm: true });
    expect(calls).toHaveLength(5);
    // The 5th call is the error ping, distinct from the 2nd (lead notification).
    expect(calls[4].url).toContain("api.telegram.org");
    expect(body(calls[4]).text as string).toContain("netlify");
  });

  it("when Telegram itself fails, logs via console.error instead of attempting another ping", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: true }, // netlify
      { ok: false, status: 500 }, // telegram fails
      { ok: true, headers: { "set-cookie": "s=1" } }, // crm login
      { ok: true }, // crm create
    ]);

    const result = await deliverLead(makeLead(), makeEnv(), fetchImpl);

    expect(result).toEqual({ netlify: true, telegram: false, crm: true });
    expect(calls).toHaveLength(4); // no extra ping attempted
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("multiple sink failures still trigger exactly one extra error ping", async () => {
    const { fetchImpl, calls } = createMockFetch([
      { ok: false, status: 500 }, // netlify fails
      { ok: true }, // telegram succeeds
      { ok: false, status: 401 }, // crm login fails
      { ok: true }, // extra telegram error ping
    ]);

    const result = await deliverLead(makeLead(), makeEnv(), fetchImpl);

    expect(result).toEqual({ netlify: false, telegram: true, crm: false });
    expect(calls).toHaveLength(4);
    const pingText = body(calls[3]).text as string;
    expect(pingText).toContain("netlify");
    expect(pingText).toContain("crm");
  });
});
