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
  summary: string;
  transcript_url: string;
  source: "phone-intake";
  brain: "elevenlabs" | "openai-lab";
}
