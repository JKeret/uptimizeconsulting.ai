// The stack-agnostic lead contract: whatever "brain" (ElevenLabs today,
// possibly an OpenAI-based lab route later) and whatever sink (CRM, email,
// Slack -- Task 3) consume/produce, they all speak this shape.
export interface Lead {
  name: string;
  business: string;
  process: string;
  callback_number: string;
  email: string;
  urgent: boolean;
  existing_client: boolean;
  /** Triage outcome. "lead" = prospect wanting help with their business
   * (full intake, all three sinks). "message" = anyone else -- vendors,
   * partners, existing contacts, personal -- who just wants Jonathan to
   * know they called (Telegram only; never pollutes the leads funnel). */
  call_type: "lead" | "message";
  /** The caller's message for Jonathan, in their own words (message calls). */
  message: string;
  summary: string;
  transcript_url: string;
  source: "phone-intake";
  brain: "elevenlabs" | "openai-lab";
}
