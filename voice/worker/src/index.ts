import { verifySignature } from "./hmac";
import { parseElevenLabs } from "./adapter-elevenlabs";

export interface Env {
  ELEVENLABS_WEBHOOK_SECRET: string;
}

const SIGNATURE_HEADER = "ElevenLabs-Signature";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST" || url.pathname !== "/postcall") {
      return new Response("Not found", { status: 404 });
    }

    const rawBody = await request.text();
    const signatureHeader = request.headers.get(SIGNATURE_HEADER);
    const nowSecs = Math.floor(Date.now() / 1000);

    const isValid = await verifySignature(rawBody, signatureHeader, env.ELEVENLABS_WEBHOOK_SECRET, nowSecs);
    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Sinks (CRM/email/Slack fan-out) arrive in Task 3 -- for now, log the
    // parsed lead so the webhook path is verifiable end-to-end.
    try {
      const payload = JSON.parse(rawBody);
      const lead = parseElevenLabs(payload);
      console.log(JSON.stringify(lead));
    } catch (err) {
      console.error("postcall webhook: failed to parse payload", err);
    }

    return new Response("ok", { status: 200 });
  },
};
