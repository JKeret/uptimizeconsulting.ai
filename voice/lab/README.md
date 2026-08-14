# The OpenAI lab line — setup

**Status: not built. Everything below is JONATHAN-GATED** — it requires an
OpenAI API key with billing enabled, a temporary Twilio number, and manual
dashboard/console steps that can't be scripted from this repo. This README
is the exact path from nothing to a working lab number; nothing in
`voice/worker/` depends on any of it (the `/lab/postcall` route ships dark —
see "Activating the route" below).

Per `docs/superpowers/specs/2026-08-14-voice-intake-design.md` §"The OpenAI
lab": the lab is parallel, not blocking. Production stays on ElevenLabs
("Ava," `voice/agent/`); this is a second, cheap number running OpenAI's
`gpt-realtime` on the **same intake prompt**, purely so Jonathan can hear the
full-duplex difference and own both stacks as a consulting asset. Lab calls
must never touch the funnel — sinks already fence this off (see
"How a lab call reaches Jonathan" below).

## 1. Buy a temporary Twilio number

Any cheap local or toll-free number in Jonathan's own Twilio
account/subaccount works — this is throwaway infra for A/B listening, not
the production 630 number. Twilio Console → Phone Numbers → Buy a Number.
Budget ~$1.15/mo + inbound minutes (same order of magnitude as the
production number's cost, per the spec's "Costs" section).

Do **not** reuse LaneFit's Twilio account or any client's number — same
pattern the design doc calls out for the production number: no client infra
for Uptimize's own line.

## 2. Elastic SIP Trunk → OpenAI's Realtime SIP connector

Follow Twilio's own tutorial, verbatim:
<https://www.twilio.com/en-us/blog/developers/tutorials/product/openai-realtime-api-elastic-sip-trunking>

At a level that survives that page changing later, the shape of it:

1. Twilio Console → Elastic SIP Trunking → create a new trunk.
2. **Origination**: point the trunk's origination URI at OpenAI's Realtime
   SIP connector endpoint (the tutorial gives the exact `sip:` URI format
   OpenAI expects — this is where inbound calls get hard-diverted straight
   into the Realtime API, no media server of ours in the call path).
3. Attach the temp number from Step 1 to this trunk (Numbers tab on the
   trunk, or point the number's Voice webhook at the trunk per the
   tutorial's wiring).
4. On the OpenAI side: a project with billing enabled, and (per the
   tutorial) a webhook configured in the OpenAI dashboard so OpenAI notifies
   your code when a SIP call arrives at the connector — accepting that call
   is what opens the Realtime session for the conversation. This webhook
   receiver + the WebSocket session driver referenced in Step 3 below is
   "the lab bridge" — build it following the tutorial's reference
   implementation; it is the one piece of custom code this lab needs beyond
   what already exists in this repo.

## 3. Configure the Realtime session

Once a call reaches the bridge and a Realtime session opens, configure it
(via a `session.update` event, per OpenAI's Realtime API) with:

- **Model**: `gpt-realtime`
- **Instructions**: the SAME assembled prompt the ElevenLabs agent uses —
  do not hand-write a second prompt, or the lab stops being a fair
  comparison. Extract it fresh from `voice/agent/agent-config.json` (which
  `voice/agent/build-prompt.mjs` writes into on every run):

  ```bash
  jq -r '.conversation_config.agent.prompt.prompt' voice/agent/agent-config.json
  ```

  Re-run `node voice/agent/build-prompt.mjs` first if `voice-canon.md` has
  changed since the config was last built, then re-extract — same staleness
  rule the ElevenLabs side already follows (`voice/agent/test-calls.md`'s
  gated checklist, `voice/RUNBOOK.md`'s "re-upload after canon change" item).
  Feed the extracted string in as-is; it already contains the persona rules,
  the intake procedure, and the canon reference, all voice-speakable.

- **A function/tool the model calls once, at the end of the call**, to
  submit the captured lead. This is the only thing about the lab setup that
  isn't a straight port of the ElevenLabs side — OpenAI's Realtime API
  doesn't have ElevenLabs' data-collection extraction or post-call webhook,
  so the tool call is how the lab bridge learns what was captured. Tool
  definition (JSON schema, registered on the session alongside the
  instructions):

  ```json
  {
    "type": "function",
    "name": "submit_lead",
    "description": "Call this exactly once, at the very end of the call, after the caller's summary has been confirmed (or the call is otherwise wrapping up). Submits the captured intake to the lab's lead-delivery pipeline.",
    "parameters": {
      "type": "object",
      "properties": {
        "summary": { "type": "string", "description": "A one-paragraph summary of the call, same style as the closing summary spoken back to the caller." },
        "fields": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "business": { "type": "string" },
            "process": { "type": "string" },
            "callback_number": { "type": "string" },
            "email": { "type": "string" },
            "urgent": { "type": "boolean" },
            "existing_client": { "type": "boolean" }
          },
          "required": ["name", "business", "process", "callback_number", "email", "urgent", "existing_client"]
        },
        "transcript_url": { "type": "string", "description": "A URL where Jonathan can review the call (bridge-hosted transcript/recording link, or the OpenAI session id if no hosted transcript exists yet)." }
      },
      "required": ["summary", "fields", "transcript_url"]
    }
  }
  ```

  When the bridge receives this function call event from the Realtime
  session, it executes the actual delivery — POST the function's arguments
  object as-is (it's already exactly the lab payload shape the worker
  expects) to:

  ```
  POST https://uptimize-voice-hook.jonathanke.workers.dev/lab/postcall
  Content-Type: application/json
  X-Lab-Token: <the LAB_TOKEN secret, below>

  {
    "summary": "...",
    "fields": {
      "name": "...", "business": "...", "process": "...",
      "callback_number": "...", "email": "...",
      "urgent": false, "existing_client": false
    },
    "transcript_url": "..."
  }
  ```

  `fields.urgent`/`fields.existing_client` can be real JSON booleans (the
  tool schema above requests them that way) or the strings `"true"`/`"yes"`
  (any casing) — `parseOpenAILab` (`voice/worker/src/adapter-openai.ts`)
  coerces both the same way `parseElevenLabs` does, so a model that emits a
  string instead of a boolean still lands correctly. After the POST, send a
  `function_call_output` back into the Realtime session (empty or `{"ok":
  true}` is fine) so the model can close the call cleanly.

## Activating the route

The worker already has the route (`POST /lab/postcall` in
`voice/worker/src/index.ts`), but it ships **dark**: `env.LAB_TOKEN` is
unset by default, and the route hard-401s on every request whenever that's
true — unset must mean off, never open. To turn it on:

```bash
cd voice/worker
# generate a value, e.g.: openssl rand -hex 32
npx wrangler secret put LAB_TOKEN
```

Use that same value as the `X-Lab-Token` header the bridge sends (Step 3
above). Nothing else about the worker needs to change — `parseOpenAILab`
always tags leads `brain: "openai-lab"`, and the sinks (Task 3,
`voice/worker/src/sinks.ts`) already fence that brain off from Netlify and
the CRM unconditionally, regardless of what `LAB_TOKEN` is set to.

## How a lab call reaches Jonathan

Only Telegram, tagged 🧪 LAB — never Netlify Forms, never the CRM. This is
enforced twice, independently: `netlifySink`/`crmSink` both short-circuit on
`lead.brain === "openai-lab"` before making any request, and
`test/adapter-openai.test.ts`'s route test locks the same guarantee
end-to-end (a mocked `fetch` proves exactly one Telegram call happens and
zero Netlify/CRM calls, for a request that hits the live route). Lab traffic
physically cannot pollute the funnel metrics the sales agent's 9am check or
the Monday marketing brief read.

## Comparison protocol

Run `voice/agent/test-calls.md`'s six scripted scenarios against **both**
numbers, back to back, same day: call the production ElevenLabs number,
then immediately call the lab number, for each scenario in turn (not all
six on one number then all six on the other — the point is to compare the
feel scenario-by-scenario while it's fresh). For each pair, note:

- Perceived latency / turn-taking feel (this is the whole point of the lab —
  full-duplex vs. ElevenLabs' turn-based model).
- Whether the lab side still holds every guardrail the EL side holds: canon-
  only pricing, no live transfer under any framing, the exact callback-
  promise sentence, the two-sentence-per-turn cap, urgent/existing-client
  flagging, the ~5-minute soft wrap, graceful handling of the abusive-caller
  scenario.
- Whether the lab's Telegram delivery (🧪 LAB tag) landed within about a
  minute of hangup, same bar as the production sink test in
  `voice/agent/test-calls.md`.

Do this "for ~a month of casual testing," not one sitting — see promotion
criteria below.

## Promotion criteria

Copied verbatim from
`docs/superpowers/specs/2026-08-14-voice-intake-design.md` §"The OpenAI
lab":

> Promotion criteria to v2: Jonathan prefers the feel after back-to-back
> calls, AND the lab has shown stable session handling + transcript capture
> for ~a month of casual testing. Promotion = repoint the 630 number's
> routing + flip the adapter; sinks unchanged.

Until both halves of that are true, the lab stays exactly what it is: a
side-by-side listening exercise on a throwaway number. Nothing about
promotion is automatic or code-gated — it's Jonathan's call, made from the
comparison protocol above.

## Costs

Twilio temp number: ~$1.15/mo + ~$0.01/min inbound (same order as
production). OpenAI `gpt-realtime` usage: ~$0.18–0.30/min model fees per the
spec — trivial at test volume, but real: this needs an OpenAI API key with
billing enabled, unlike the ElevenLabs Creator plan's included minutes.

## Out of scope here

Building "the lab bridge" itself (the webhook receiver + Realtime WebSocket
session driver referenced in Step 2.4 / Step 3) is not part of this task —
this README documents the target shape (session config, tool schema, the
worker endpoint it must call) so that build has a clear spec to hit,
whenever Jonathan picks up the OpenAI API key + billing + temp number and
takes this on.
