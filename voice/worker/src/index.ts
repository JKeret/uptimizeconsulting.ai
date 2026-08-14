import { verifySignature } from "./hmac";
import { parseElevenLabs } from "./adapter-elevenlabs";
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
}

const SIGNATURE_HEADER = "ElevenLabs-Signature";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/postcall") {
      return new Response("Not found", { status: 404 });
    }

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
  },
};
