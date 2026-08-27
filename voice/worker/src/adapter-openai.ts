import type { Lead } from "./contract";
import { asBoolean, asString, asCallType } from "./adapter-elevenlabs";

// OpenAI-lab post-call payload shape (we control this -- it's emitted by
// the lab bridge/tool call we write in voice/lab/, not a third-party
// webhook, so there's no envelope to reverse-engineer):
//   { summary, fields: { name, business, process, callback_number, email,
//     urgent, existing_client }, transcript_url }
interface OpenAILabFields {
  name?: unknown;
  business?: unknown;
  process?: unknown;
  callback_number?: unknown;
  email?: unknown;
  urgent?: unknown;
  existing_client?: unknown;
  call_type?: unknown;
  message?: unknown;
}

/** Parses an OpenAI-lab postcall payload into the stack-agnostic `Lead`
 * contract (`brain: "openai-lab"`). Never throws on missing/malformed
 * fields -- degrades to empty strings / false, matching `parseElevenLabs`'s
 * defensive style. Booleans use the exact same truthy-string coercion as
 * the EL adapter (`asBoolean`, imported rather than duplicated) so
 * "true"/"yes" (any casing) behave identically across both brains. */
export function parseOpenAILab(payload: unknown): Lead {
  const fields = ((payload as any)?.fields ?? {}) as OpenAILabFields;

  return {
    name: asString(fields.name),
    business: asString(fields.business),
    process: asString(fields.process),
    callback_number: asString(fields.callback_number),
    email: asString(fields.email),
    urgent: asBoolean(fields.urgent),
    existing_client: asBoolean(fields.existing_client),
    call_type: asCallType(fields.call_type),
    message: asString(fields.message),
    summary: asString((payload as any)?.summary),
    transcript_url: asString((payload as any)?.transcript_url),
    source: "phone-intake",
    brain: "openai-lab",
  };
}
