import type { Lead } from "./contract";

// ElevenLabs post-call webhook payload shape (the parts we read):
//   { type: "post_call_transcription",
//     data: { conversation_id, analysis: { transcript_summary,
//              data_collection_results: { <field_id>: { value }, ... } } } }
// Each data-collection result is an object whose `value` holds the
// extracted datum (mirrors lanefit/worker/src/index.ts's extraction of
// `analysis.data_collection_results`).
const DATA_COLLECTION_FIELD_IDS = [
  "caller_name",
  "business_name",
  "process_description",
  "callback_number",
  "email",
  "urgent",
  "existing_client",
] as const;

type FieldId = (typeof DATA_COLLECTION_FIELD_IDS)[number];

/** Defensive read of `data.analysis.data_collection_results` -> raw `value`s
 * keyed by field id. Missing/malformed results degrade to `undefined`
 * rather than throwing. */
function extractRawFields(payload: unknown): Partial<Record<FieldId, unknown>> {
  const results = (payload as any)?.data?.analysis?.data_collection_results ?? {};
  const fields: Partial<Record<FieldId, unknown>> = {};
  for (const id of DATA_COLLECTION_FIELD_IDS) {
    fields[id] = results?.[id]?.value;
  }
  return fields;
}

// Exported so other adapters (e.g. adapter-openai.ts's `parseOpenAILab`)
// can reuse the same defensive coercion instead of duplicating it -- every
// brain's payload degrades missing/malformed fields to "" / false the same
// way.
export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Coerces true/false, "true"/"false", "yes"/"no" (case-insensitive) to a
 * boolean. Any other value (including missing) is falsy. */
export function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "yes";
  }
  return false;
}

/** Parses an ElevenLabs post-call webhook payload into the stack-agnostic
 * `Lead` contract. Never throws on missing/malformed fields -- they degrade
 * to empty strings / false, matching the reference extraction pattern in
 * lanefit/worker/src/index.ts. */
export function parseElevenLabs(payload: unknown): Lead {
  const fields = extractRawFields(payload);
  const conversationId = asString((payload as any)?.data?.conversation_id);
  const summary = asString((payload as any)?.data?.analysis?.transcript_summary);
  // Callers routinely say "call me back on this number" instead of reciting
  // digits, so the data-collection field comes back empty even though the
  // agent confirmed the number (happened on the first real inbound call,
  // 2026-08-20). The caller ID lives in the payload's phone metadata; use it
  // whenever nothing was explicitly dictated.
  const callerId = asString((payload as any)?.data?.metadata?.phone_call?.external_number);

  return {
    name: asString(fields.caller_name),
    business: asString(fields.business_name),
    process: asString(fields.process_description),
    callback_number: asString(fields.callback_number) || callerId,
    email: asString(fields.email),
    urgent: asBoolean(fields.urgent),
    existing_client: asBoolean(fields.existing_client),
    summary,
    transcript_url: `https://elevenlabs.io/app/agents/history/${conversationId}`,
    source: "phone-intake",
    brain: "elevenlabs",
  };
}
