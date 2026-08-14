import { verifySignature } from "./hmac";
import { parseElevenLabs } from "./adapter-elevenlabs";
import { parseOpenAILab } from "./adapter-openai";
import { deliverLead } from "./sinks";
import type { Lead } from "./contract";

export interface Env {
  ELEVENLABS_WEBHOOK_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  NETLIFY_SITE_URL?: string;
  CRM_BASE_URL?: string;
  CRM_EMAIL?: string;
  CRM_PASSWORD?: string;
  // Optional: UUID of an existing `lead_source` row (Task 4 provisioning used
  // the CRM's pre-seeded "Inbound Call" source). Omit to create leads with no
  // source attribution -- the field is optional on the CRM's side.
  CRM_LEAD_SOURCE_ID?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  // Shared secret guarding POST /lab/postcall (the OpenAI-lab route, Task
  // 7). Unset means the route is OFF -- every request 401s -- unlike the
  // EL route's HMAC check, an absent secret here must never be read as
  // "no auth required."
  LAB_TOKEN?: string;
}

const SIGNATURE_HEADER = "ElevenLabs-Signature";
const LAB_TOKEN_HEADER = "X-Lab-Token";

/** POST /postcall -- the ElevenLabs post-call webhook. HMAC-signed
 * (`ElevenLabs-Signature`), parsed via `parseElevenLabs`, delivered via all
 * three sinks. */
async function handlePostcall(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get(SIGNATURE_HEADER);
  const nowSecs = Math.floor(Date.now() / 1000);

  let isValid: boolean;
  try {
    isValid = await verifySignature(rawBody, signatureHeader, env.ELEVENLABS_WEBHOOK_SECRET, nowSecs);
  } catch (err) {
    console.error("postcall webhook: signature verification threw", err);
    return new Response("Invalid signature", { status: 401 });
  }
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let lead: Lead;
  try {
    const payload = JSON.parse(rawBody);
    lead = parseElevenLabs(payload);
  } catch (err) {
    console.error("postcall webhook: failed to parse payload", err);
    return new Response("Bad request", { status: 400 });
  }

  // Fan out to the delivery sinks (Netlify/Telegram/CRM) without making
  // ElevenLabs wait on them -- the webhook must ack fast regardless of
  // how the sinks behave.
  ctx.waitUntil(deliverLead(lead, env));

  return new Response("ok", { status: 200 });
}

/** POST /lab/postcall -- the OpenAI-lab route (Task 7). The lab bridge is
 * our own code (not a third-party webhook sender), so it's guarded by a
 * shared secret instead of an HMAC signature: `X-Lab-Token` must equal
 * `env.LAB_TOKEN` exactly. `env.LAB_TOKEN` unset always 401s, regardless of
 * what header the caller sends -- the route is OFF until a token is
 * provisioned (`wrangler secret put LAB_TOKEN`), never implicitly open.
 * Leads parsed via `parseOpenAILab` carry `brain: "openai-lab"`, which the
 * sinks (Task 3) already fence off from Netlify/CRM -- Telegram-only. */
async function handleLabPostcall(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const tokenHeader = request.headers.get(LAB_TOKEN_HEADER);
  if (!env.LAB_TOKEN || !tokenHeader || tokenHeader !== env.LAB_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  let lead: Lead;
  try {
    const payload = JSON.parse(await request.text());
    lead = parseOpenAILab(payload);
  } catch (err) {
    console.error("lab postcall: failed to parse payload", err);
    return new Response("Bad request", { status: 400 });
  }

  ctx.waitUntil(deliverLead(lead, env));

  return new Response("ok", { status: 200 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/postcall") {
      return handlePostcall(request, env, ctx);
    }
    if (request.method === "POST" && url.pathname === "/lab/postcall") {
      return handleLabPostcall(request, env, ctx);
    }
    return new Response("Not found", { status: 404 });
  },
};
