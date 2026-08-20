import { describe, it, expect } from "vitest";
import { parseElevenLabs } from "../src/adapter-elevenlabs";

function fixture(overrides: {
  conversation_id?: string;
  results?: Record<string, { value: unknown } | undefined>;
  transcript_summary?: string;
}) {
  const {
    conversation_id = "conv_abc123",
    results = {},
    transcript_summary = "Caller wants a website redesign.",
  } = overrides;
  return {
    type: "post_call_transcription",
    data: {
      agent_id: "agent_xyz",
      conversation_id,
      analysis: {
        transcript_summary,
        data_collection_results: results,
      },
    },
  };
}

describe("parseElevenLabs", () => {
  it("maps a full payload to a complete Lead", () => {
    const payload = fixture({
      conversation_id: "conv_full",
      transcript_summary: "Wants a new site built.",
      results: {
        caller_name: { value: "Jane Doe" },
        business_name: { value: "Doe Consulting" },
        process_description: { value: "Need a marketing site" },
        callback_number: { value: "+15551234567" },
        email: { value: "jane@doeconsulting.com" },
        urgent: { value: true },
        existing_client: { value: false },
      },
    });

    const lead = parseElevenLabs(payload);

    expect(lead).toEqual({
      name: "Jane Doe",
      business: "Doe Consulting",
      process: "Need a marketing site",
      callback_number: "+15551234567",
      email: "jane@doeconsulting.com",
      urgent: true,
      existing_client: false,
      summary: "Wants a new site built.",
      transcript_url: "https://elevenlabs.io/app/agents/history/conv_full",
      source: "phone-intake",
      brain: "elevenlabs",
    });
  });

  it("falls back to caller ID when callback_number was not dictated", () => {
    const payload = fixture({
      conversation_id: "conv_callerid",
      results: { caller_name: { value: "Dave" } },
    }) as any;
    payload.data.metadata = { phone_call: { external_number: "+13102545188" } };

    const lead = parseElevenLabs(payload);

    expect(lead.callback_number).toBe("+13102545188");
  });

  it("prefers a dictated callback_number over caller ID", () => {
    const payload = fixture({
      conversation_id: "conv_dictated",
      results: { callback_number: { value: "+15551234567" } },
    }) as any;
    payload.data.metadata = { phone_call: { external_number: "+13102545188" } };

    const lead = parseElevenLabs(payload);

    expect(lead.callback_number).toBe("+15551234567");
  });

  it("defaults missing fields to empty strings / false", () => {
    const payload = fixture({ conversation_id: "conv_missing", results: {}, transcript_summary: "" });

    const lead = parseElevenLabs(payload);

    expect(lead).toEqual({
      name: "",
      business: "",
      process: "",
      callback_number: "",
      email: "",
      urgent: false,
      existing_client: false,
      summary: "",
      transcript_url: "https://elevenlabs.io/app/agents/history/conv_missing",
      source: "phone-intake",
      brain: "elevenlabs",
    });
  });

  it("coerces boolean-ish strings to true for urgent/existing_client", () => {
    const payload = fixture({
      conversation_id: "conv_bool",
      results: {
        urgent: { value: "true" },
        existing_client: { value: "yes" },
      },
    });

    const lead = parseElevenLabs(payload);

    expect(lead.urgent).toBe(true);
    expect(lead.existing_client).toBe(true);
  });

  it("coerces non-truthy strings to false for urgent/existing_client", () => {
    const payload = fixture({
      conversation_id: "conv_bool_false",
      results: {
        urgent: { value: "false" },
        existing_client: { value: "no" },
      },
    });

    const lead = parseElevenLabs(payload);

    expect(lead.urgent).toBe(false);
    expect(lead.existing_client).toBe(false);
  });

  it("case-insensitively coerces TRUE/Yes", () => {
    const payload = fixture({
      conversation_id: "conv_bool_case",
      results: {
        urgent: { value: "TRUE" },
        existing_client: { value: "Yes" },
      },
    });

    const lead = parseElevenLabs(payload);

    expect(lead.urgent).toBe(true);
    expect(lead.existing_client).toBe(true);
  });
});
