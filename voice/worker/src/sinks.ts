// Lead-delivery sinks: Netlify (forwards into the existing starter-project
// Netlify Form so the CRM/notification wiring already built for the web
// intake form fires for phone leads too), Telegram (instant human ping),
// and the Uptimize CRM (system of record). Each sink is isolated: a thrown
// error in one must never stop the others (see `deliverLead`'s
// Promise.allSettled fan-out), and none may ever throw back into the
// webhook handler -- `deliverLead` always resolves.
//
// Global constraint: `brain === "openai-lab"` leads are a test/lab route --
// they skip Netlify and the CRM entirely (no point polluting the real
// pipeline or the CRM with lab traffic) but still ping Telegram, tagged
// 🧪 LAB, so a human can see the lab route is alive.
import type { Lead } from "./contract";
import type { Env } from "./index";

export interface DeliveryResult {
  netlify: boolean;
  telegram: boolean;
  crm: boolean;
}

// -- Netlify --------------------------------------------------------------

/** Forwards a lead into the `starter-project` Netlify Form as an urlencoded
 * POST, matching the fields the real web form submits. Skips (returns
 * `false`, no request made) for lab leads or when NETLIFY_SITE_URL isn't
 * configured. Throws on a non-ok response -- the caller (`deliverLead`)
 * decides what to do with a failure. */
export async function netlifySink(lead: Lead, env: Env, fetchImpl: typeof fetch): Promise<boolean> {
  if (lead.brain === "openai-lab") return false;
  if (!env.NETLIFY_SITE_URL) return false;

  const form = new URLSearchParams({
    "form-name": "starter-project",
    name: lead.name,
    email: lead.email,
    phone: lead.callback_number,
    business: lead.business,
    process: lead.process,
    source: "phone-intake",
  });

  const res = await fetchImpl(new URL("/", env.NETLIFY_SITE_URL).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`Netlify sink failed: HTTP ${res.status}`);
  return true;
}

// -- Telegram ---------------------------------------------------------------

function telegramText(lead: Lead): string {
  const prefixes: string[] = [];
  if (lead.urgent) prefixes.push("🔴 URGENT");
  if (lead.existing_client) prefixes.push("🔴 EXISTING CLIENT");
  if (lead.brain === "openai-lab") prefixes.push("🧪 LAB");
  const header = prefixes.length > 0 ? `${prefixes.join(" — ")}\n` : "";

  return (
    `${header}${lead.summary || "(no summary)"}\n\n` +
    `Name: ${lead.name || "(not given)"}\n` +
    `Business: ${lead.business || "(not given)"}\n` +
    `Process: ${lead.process || "(not given)"}\n` +
    `Phone: ${lead.callback_number || "(not given)"}\n` +
    `Email: ${lead.email || "(not given)"}\n\n` +
    `Transcript: ${lead.transcript_url}`
  );
}

async function sendTelegramMessage(env: Env, fetchImpl: typeof fetch, text: string): Promise<Response> {
  return fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}

/** Pings the Telegram channel with the lead's details. Not lab-fenced --
 * lab leads still ping, tagged 🧪 LAB, so the route is visibly alive. Skips
 * (returns `false`, no request made) when TELEGRAM_BOT_TOKEN/CHAT_ID aren't
 * configured. Throws on a non-ok response. */
export async function telegramSink(lead: Lead, env: Env, fetchImpl: typeof fetch): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;

  const res = await sendTelegramMessage(env, fetchImpl, telegramText(lead));
  if (!res.ok) throw new Error(`Telegram sink failed: HTTP ${res.status}`);
  return true;
}

// -- CRM ----------------------------------------------------------------

// The CRM requires an Origin matching its CSRF allowlist on every request
// plus the CF Access service-token headers, even for server-to-server
// calls (ported from lanefit/worker/src/crm.ts, where a hardcoded origin
// caused real login 403s). Derived from CRM_BASE_URL so re-pointing the
// worker can't silently desync the two.
function crmHeaders(env: Env, extra?: Record<string, string>): Record<string, string> {
  return {
    Origin: new URL(env.CRM_BASE_URL as string).origin,
    "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID ?? "",
    "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET ?? "",
    ...extra,
  };
}

interface CrmSession {
  cookie?: string;
  token?: string;
}

/** Logs into the CRM and carries forward BOTH the session cookie and a JSON
 * bearer token (whichever the login response actually provides) since it's
 * unconfirmed which one the real /leads route checks. */
async function crmLogin(env: Env, fetchImpl: typeof fetch): Promise<CrmSession> {
  const res = await fetchImpl(`${env.CRM_BASE_URL}/auth/login`, {
    method: "POST",
    headers: crmHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify({ email: env.CRM_EMAIL, password: env.CRM_PASSWORD }),
  });
  if (!res.ok) throw new Error(`CRM login failed: HTTP ${res.status}`);

  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : undefined;
  let token: string | undefined;
  try {
    const parsed = (await res.json()) as { token?: unknown };
    token = typeof parsed?.token === "string" ? parsed.token : undefined;
  } catch {
    token = undefined;
  }
  return { cookie, token };
}

/** Logs in, then creates a CRM lead. Skips (returns `false`, no request
 * made) for lab leads or when CRM_BASE_URL/CRM_EMAIL/CRM_PASSWORD aren't
 * configured. Throws on any non-ok response. The real `/leads` route
 * contract is unconfirmed until Task 4's live verification -- built to the
 * documented shape in the meantime. */
export async function crmSink(lead: Lead, env: Env, fetchImpl: typeof fetch): Promise<boolean> {
  if (lead.brain === "openai-lab") return false;
  if (!env.CRM_BASE_URL || !env.CRM_EMAIL || !env.CRM_PASSWORD) return false;

  const session = await crmLogin(env, fetchImpl);
  const authHeaders: Record<string, string> = {};
  if (session.cookie) authHeaders.Cookie = session.cookie;
  if (session.token) authHeaders.Authorization = `Bearer ${session.token}`;

  const notes = [lead.summary, lead.process, lead.transcript_url].filter(Boolean).join("\n\n");
  const res = await fetchImpl(`${env.CRM_BASE_URL}/leads`, {
    method: "POST",
    headers: crmHeaders(env, { "Content-Type": "application/json", ...authHeaders }),
    body: JSON.stringify({
      title: `Phone intake — ${lead.name || lead.callback_number}`,
      name: lead.name,
      email: lead.email,
      phone: lead.callback_number,
      notes,
      source: "phone-intake",
    }),
  });
  if (!res.ok) throw new Error(`CRM lead create failed: HTTP ${res.status}`);
  return true;
}

// -- Fan-out ----------------------------------------------------------

function errorPingText(lead: Lead, failedSinks: string[]): string {
  return (
    `⚠️ Lead delivery sink failure: ${failedSinks.join(", ")}\n` +
    `Caller: ${lead.name || lead.callback_number}\n` +
    `Check the Worker logs -- the lead may not have reached every sink.`
  );
}

/** Fans a parsed lead out to all three sinks in isolation: one sink's
 * throw never stops the others (Promise.allSettled), and this function
 * itself never throws -- it's always safe to hand to `ctx.waitUntil`.
 * On any sink failure it sends one extra Telegram error ping, unless
 * Telegram itself was the sink that failed (then there's no channel to
 * ping through, so it just logs). */
export async function deliverLead(
  lead: Lead,
  env: Env,
  fetchImpl: typeof fetch = fetch
): Promise<DeliveryResult> {
  const [netlifyOutcome, telegramOutcome, crmOutcome] = await Promise.allSettled([
    netlifySink(lead, env, fetchImpl),
    telegramSink(lead, env, fetchImpl),
    crmSink(lead, env, fetchImpl),
  ]);

  const failedSinks: string[] = [];
  for (const [name, outcome] of [
    ["netlify", netlifyOutcome],
    ["telegram", telegramOutcome],
    ["crm", crmOutcome],
  ] as const) {
    if (outcome.status === "rejected") {
      failedSinks.push(name);
      console.error(`voice-intake: ${name} sink failed`, outcome.reason);
    }
  }

  if (failedSinks.length > 0) {
    if (telegramOutcome.status === "rejected") {
      // Telegram is the failed sink itself -- no channel left to ping
      // through. Already logged above.
    } else {
      try {
        const res = await sendTelegramMessage(env, fetchImpl, errorPingText(lead, failedSinks));
        if (!res.ok) {
          console.error(`voice-intake: error ping to Telegram failed: HTTP ${res.status}`);
        }
      } catch (err) {
        console.error("voice-intake: error ping to Telegram failed", err);
      }
    }
  }

  return {
    netlify: netlifyOutcome.status === "fulfilled" ? netlifyOutcome.value : false,
    telegram: telegramOutcome.status === "fulfilled" ? telegramOutcome.value : false,
    crm: crmOutcome.status === "fulfilled" ? crmOutcome.value : false,
  };
}
