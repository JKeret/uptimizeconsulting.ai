# Uptimize voice intake line — design

Date: 2026-08-14. Status: approved direction (EL-first, OpenAI lab in parallel).
The phone completes the funnel: web form + site bot + (soon) WhatsApp exist;
calls today hit an unanswered Google Voice number. The line is also a product
demo: callers experience exactly the AI intake Uptimize sells.

## Decisions (Jonathan, 2026-08-14)

1. **Number:** 630-445-1958 (local 630, currently Google Voice, unused).
   Jonathan is unlocking it; port target is his OWN Twilio account/subaccount —
   NOT LaneFit's (no client infra for Uptimize's line; same pattern, separate
   plumbing). Until the port lands, build + test on a temporary Twilio number
   and ElevenLabs browser test calls.
2. **Persona:** named assistant ("Ava" working name), openly AI, no Jonathan in
   the greeting. Greeting: "Thanks for calling Uptimize Consulting — let's
   build something great. I'm Ava, the AI assistant here. How can I help?"
   Tagline default: **"Let's build something great"** (alternates parked:
   "One process at a time").
3. **Escalation:** no live transfer, ever (v1). Callback promise: "Jonathan
   will call you back within one business day." Urgency or existing-client
   signals set flags that make the Telegram alert loud — Jonathan chooses to
   call back in minutes; the agent never promises faster than one business day.
4. **Knowledge scope:** intake-first + canon answers. The agent answers money
   questions from KB canon only ($1,000 starter / about two weeks / $10,000 to
   $25,000+ builds / $30,000 to $75,000+ compliance-heavy / $300 to $1,500 per
   month care) and a five-question FAQ digest (what does it cost; how long does
   it take; what should I automate first; do I need to be technical; how do we
   start). Every thread steers back to capture; soft wrap at ~5 minutes. No
   free consulting marathons.
5. **Stack:** ElevenLabs-hosted agent (Kristina pattern) for the production
   line; OpenAI `gpt-realtime` runs as a LAB on a separate temp number (see
   §Lab). New Uptimize ElevenLabs account (Creator tier, 275 min/mo included,
   ~$0.10/min after; usage alert at 80%).

## Architecture

```
caller → 630-445-1958 (Twilio, Jonathan's account)
           → ElevenLabs Agents platform (native Twilio attach; no server in call path)
               agent "Ava": prompt = intake script + voice canon digest
               post-call webhook (transcript + extracted fields)
                 → uptimize-voice-hook (Cloudflare Worker, Jonathan's CF account)
                     sink a: Netlify form "starter-project" POST, source=phone-intake
                     sink b: Telegram alert to Jonathan (loud if urgent/existing-client)
                     sink c: Uptimize CRM lead write via CF Access service token (best-effort)
```

**The lead contract is stack-agnostic** — this is the load-bearing design rule.
The Worker accepts a normalized payload:

```json
{
  "name": "", "business": "", "process": "", "callback_number": "",
  "email": "", "urgent": false, "existing_client": false,
  "summary": "", "transcript_url": "", "source": "phone-intake",
  "brain": "elevenlabs | openai-lab"
}
```

An adapter per brain (EL post-call webhook shape now; OpenAI lab shape later)
maps into this contract. Swapping brains never touches the sinks or the funnel.

### Sinks

- **a. Netlify form (primary):** POST to the existing `starter-project` form
  with the contract fields mapped to the form's name/email/phone/business/
  process fields + `source=phone-intake` (add a hidden `source` field to the
  form — web submissions default `source=web`). Voice leads thereby land in
  the exact pipeline the sales agent checks at 9am, the Monday brief counts,
  and the ads experiment's "qualified lead" definition already reads. No new
  lead store.
- **b. Telegram (immediate):** direct Bot API call from the Worker (bot token
  as Worker secret; chat = Jonathan). Normal lead = one message with the
  summary + fields + transcript link. `urgent` or `existing_client` = prefixed
  loudly (🔴) so it reads as "call back now if you choose."
- **c. CRM (best-effort):** create lead via Uptimize CRM API through a
  Cloudflare Access **service token** (create token + Access policy for the
  CRM app; Worker sends CF-Access-Client-Id/Secret headers; CSRF needs Origin
  header per the known API recipes). If service-token auth fights back, v1
  ships with a+b and CRM write becomes a fast follow — the Netlify sink is the
  source of truth either way.

### Failure handling

- Worker verifies the EL webhook signature (EL HMAC) and replies 200 fast;
  sink failures never bounce the webhook. Each sink is independent
  (`Promise.allSettled`); any sink failure itself triggers a Telegram error
  ping (or, if Telegram is the failed sink, a log line + email fallback).
- If the post-call webhook never arrives, the call still exists in the EL
  Conversations dashboard (transcript + extraction) — same recovery story as
  the Kristina runbook.

## Repo layout (this repo, `voice/`)

- `voice/agent/` — create-agent script, prompt template, data-collection
  (extraction) schema, voice-pick + test-call scripts. Mirrors LaneFit's
  `agent/` recipes but reads Uptimize values.
- `voice/worker/` — `uptimize-voice-hook` (Wrangler project): webhook handler,
  adapters, sinks, unit tests with mock EL payloads.
- `voice/RUNBOOK.md` — ops crib: dashboards, "number misbehaves" checks,
  minutes top-up, port status, lab number map.
- Secrets: EL API key, Telegram bot token, CF Access service token, Netlify
  form endpoint — Worker secrets / EL dashboard only, never in git.

## Keeping phone and chat from drifting

`scripts/build-bot-knowledge.mjs` gains a third output: `voice-canon.md` — the
section-0 canon plus a top-5 FAQ digest, compact enough for a voice prompt.
The agent prompt embeds it; the runbook's publish step already regenerates the
KB, so the same command now refreshes the voice brain text (re-uploading to EL
is one script call in `voice/agent/`).

## The OpenAI lab (parallel, not blocking)

- Separate cheap Twilio number (~$1.15/mo) SIP-trunked to OpenAI's Realtime
  SIP connector, running `gpt-realtime` with the SAME intake prompt and an
  adapter emitting the same lead contract (brain=`openai-lab`), sinks b only
  (Telegram, marked LAB) — lab calls must not pollute the funnel metrics.
- Purpose: hear the full-duplex difference on identical scripts; own both
  stacks as a consulting asset.
- Promotion criteria to v2: Jonathan prefers the feel after back-to-back
  calls, AND the lab has shown stable session handling + transcript capture
  for ~a month of casual testing. Promotion = repoint the 630 number's routing
  + flip the adapter; sinks unchanged.
- Lab costs: ~$0.18–0.30/min model fees, trivial at test volume.

## Testing

- **Worker unit tests:** webhook signature check, adapter mapping, per-sink
  fan-out with mocks, sink-failure isolation.
- **Agent scripted calls** (browser test + real phone once a number attaches):
  1. happy-path intake → all contract fields extracted;
  2. "how much does it cost?" → canon numbers verbatim, then back to intake;
  3. "let me talk to a human" → callback promise, no transfer, flag set;
  4. existing client + urgent → 🔴 Telegram;
  5. rambler → soft wrap by ~5 minutes;
  6. off-topic/abusive → polite close.
- **End-to-end:** one real call → Netlify form row with source=phone-intake +
  Telegram alert (+ CRM lead if sink c ships) within a minute of hangup.
- **Ops check:** sales agent's next 9am check surfaces the test lead.

## Costs (steady state)

Twilio number ~$1.15/mo + ~$0.01/min inbound; ElevenLabs Creator ~$22/mo
(275 min included, $0.10/min after); CF Worker free tier; lab number +
OpenAI usage as tested. Total well under $50/mo at early volume.

## Out of scope (v1)

Outbound calling, SMS channel, after-hours/holiday branching, voicemail
transcription of the old GV number, WhatsApp (separate InstantAIGuru track on
the same number), live transfer of any kind.

## Success criteria

- The 630 number answers 24/7 within two rings, in persona, from port day.
- Every completed intake lands in Netlify forms + Telegram inside a minute.
- Canon answers on the phone match the site and chat bot word-for-word on
  pricing and timeline.
- Jonathan can run the ops with the RUNBOOK alone (Kristina-style).
