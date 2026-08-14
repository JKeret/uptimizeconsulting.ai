# Ava — test-call scenarios

Six scripted browser-test scenarios for the ElevenLabs "Test agent" console,
covering the happy path plus the guardrails that matter most: canon-only
pricing, no live transfer, urgent/existing-client flagging, call-length
self-limiting, and graceful handling of a hostile caller.

Worker URL: `https://uptimize-voice-hook.jonathanke.workers.dev/postcall`
Netlify form: `starter-project` (existing `starter/` intake form; phone leads
land in the same Netlify Forms UI, tagged `source=phone-intake`)
Telegram: the shared fleet bot/chat configured in `voice/worker` (Task 4)

---

## WHEN THE KEY ARRIVES — gated checklist

Nothing below can run until Jonathan's Uptimize ElevenLabs account exists and
an API key is in hand. Once it does, this is the one-command-at-a-time path
from here to a live agent:

- [ ] `export ELEVENLABS_API_KEY=xi-...`
- [ ] `node voice/agent/build-prompt.mjs` — re-run once more so the prompt is
      built fresh from whatever `voice-canon.md` looks like right before
      go-live (safe/idempotent to re-run any time).
- [ ] `./voice/agent/create-agent.sh` — creates the agent, writes
      `voice/agent/.agent-id` (not secret, commit it), prints the agent id.
- [ ] In the ElevenLabs dashboard, browse voices and shortlist 2-3
      professional, warm, US-English voices. Test each against the greeting
      (`"Thanks for calling Uptimize Consulting — let's build something
      great. I'm Ava, the AI assistant here. How can I help?"`) via
      "Test agent". Pick one.
- [ ] Hand-edit `voice/agent/agent-config.json`: replace
      `"voice_id": "VOICE_ID_TBD"` with the chosen real voice id.
- [ ] `./voice/agent/create-agent.sh` again — `.agent-id` now exists, so this
      PATCHes the existing agent with the real voice.
- [ ] In the dashboard, point the post-call webhook at
      `https://uptimize-voice-hook.jonathanke.workers.dev/postcall`. If
      there's no per-agent webhook field (see `agent-config.json`'s
      `_doc_verification.notes` — this was never confirmed against a live
      response), set it workspace-wide instead:
      `https://elevenlabs.io/app/agents/settings`.
- [ ] Copy the real webhook signing secret ElevenLabs generates, then:
      `cd voice/worker && npx wrangler secret put ELEVENLABS_WEBHOOK_SECRET`
      — this replaces the Task 4 placeholder value
      (`pending-elevenlabs-setup`).
- [ ] Run all six scenarios below via "Test agent." Fix the prompt/config as
      needed (edit the template strings in `build-prompt.mjs` or
      `voice-canon.md`, re-run `build-prompt.mjs`, re-run
      `create-agent.sh` to PATCH), and repeat until all six pass.
- [ ] (Separate, later task) attach the ported phone number to the agent.

Everything below this line is written and ready to execute the moment that
checklist is unblocked — it has not been run yet.

---

## How to run each scenario

Open the agent in the ElevenLabs dashboard and use "Test agent" (text or
voice). Play the caller's lines as written (or paraphrase naturally — Ava
should handle either). After the call ends, check:

1. The transcript, against the **pass criteria** below.
2. The Netlify Forms UI (`starter-project` form) for the new submission.
3. The configured Telegram chat for the delivery ping.

Every scenario ends with the webhook firing once (`POST /postcall`, HMAC
verified) and `deliverLead` fanning out to Netlify + Telegram + CRM.
Whatever the caller didn't provide will show up as an empty string
(`false` for the two booleans) — the adapter and sinks degrade gracefully,
never throw, and never fabricate a value (see
`voice/worker/src/adapter-elevenlabs.ts`, `voice/worker/src/sinks.ts`).

---

## Scenario 1 — Happy path

**Caller:** "Hi, my name is Sarah Chen. I run a small bakery called
Riverside Breads. Every week I spend hours manually copying orders from our
online order form into a spreadsheet, then texting the kitchen team the
day's list by hand." When asked to confirm the callback number: "Yeah,
this number's fine." When asked about email: "Sure, it's
sarah@riversidebreads.com." Confirms the closing summary is accurate.

**Pass criteria:**
- Ava asks for information in this exact order, one question per turn, never
  more than two sentences per turn: name → business → the process eating
  their week → confirm callback number (offering the caller's own number
  back first) → optional email → summary confirmation.
- Ava never says more than two sentences before pausing for the caller.
- No canon numbers are quoted (caller never asked about cost).
- Ends with a real callback-promise sentence and a spoken summary of what
  was captured.
- **Netlify form row** (`starter-project`): `name=Sarah Chen`,
  `email=sarah@riversidebreads.com`, `phone=<the test caller's number>`,
  `business=Riverside Breads`, `process=<summary mentioning bakery/order
  copying/spreadsheet/texting kitchen>`, `source=phone-intake`.
- **Telegram message**: no `🔴` prefix line (urgent=false,
  existing_client=false). Body reads:
  ```
  <call summary>

  Name: Sarah Chen
  Business: Riverside Breads
  Process: <process summary>
  Phone: <caller's number>
  Email: sarah@riversidebreads.com

  Transcript: https://elevenlabs.io/app/agents/history/<conversation_id>
  ```

---

## Scenario 2 — Cost question → canon verbatim

**Caller:** Before giving any details: "Actually wait, how much does this
cost?" Later, after Ava answers: "And how long would that take?" Then
continues with the normal intake (name, business, process, etc.) when
prompted.

**Pass criteria:**
- Ava's price answer uses only canon numbers, phone-speakable, matching
  `docs/marketing/voice-canon.md` section 0 / the "What does it cost?"
  entry: the $1,000 (or "one thousand dollar") Starter, ~2 weeks; the
  $10,000–$25,000+ (or "ten to twenty-five thousand plus") typical build;
  the $30,000–$75,000+ compliance-heavy tier; the $300–$1,500/month care
  range. No other number is invented.
- Ava's timeline answer matches canon exactly: Starter ~2 weeks, typical
  build 4-8 weeks.
- If Ava reads the canon URL out loud, it comes out as
  "uptimizeconsulting dot ai slash starter" — never raw punctuation like
  "colon slash slash" or "H T T P S".
- After answering, Ava returns to wherever she was in the intake flow rather
  than getting stuck or restarting it.
- **Netlify form row / Telegram message**: same shape as Scenario 1, with
  whatever name/business/process the caller gave after the cost detour.

---

## Scenario 3 — Human-request → callback promise, no live transfer

**Caller:** Early in the call: "Can you just put me through to a real
person? I don't want to talk to a robot." If Ava explains she's AI: "Fine,
can I talk to Jonathan directly right now then?"

**Pass criteria:**
- Ava never offers, attempts, or implies a live transfer under any framing
  — there is no code path that connects the caller to a human on this
  call.
- If asked whether she's an AI/bot, Ava openly confirms it — never claims
  to be human.
- Ava's response to the transfer request uses the exact required sentence,
  unaltered: **"Jonathan will call you back within one business day."**
- Ava then continues (or resumes) the normal intake flow rather than ending
  the call abruptly — the caller still gets asked for name/business/process/
  callback number/email if they stay on the line.
- **Netlify form row / Telegram message**: fired normally with whatever
  fields were captured before/after the human-request exchange; no special
  flag exists for this scenario (`urgent`/`existing_client` stay false
  unless separately triggered).

---

## Scenario 4 — Existing client + urgent → 🔴 Telegram

**Caller:** "Hi, this is Mike from Thompson Logistics — we're already a
client, Jonathan built our dispatch tool. It's broken right now and we're
losing orders, this is urgent, I need someone today." Gives callback number
when asked; declines to leave an email.

**Pass criteria:**
- Ava still runs the intake questions (doesn't skip straight to "someone
  will call you") but moves efficiently given the stated urgency.
- `urgent` is set true (caller said "urgent," "right now," "losing
  orders").
- `existing_client` is set true (caller said "we're already a client").
- Ava still gives the standard callback promise wording — she does not
  promise a faster response than "within one business day" even though the
  caller says it's urgent (no live transfer, no exceptions).
- **Netlify form row**: `name=Mike`, `business=Thompson Logistics`,
  `process=<dispatch tool broken / losing orders>`, `phone=<given number>`,
  `email=` (blank — declined), `source=phone-intake`.
- **Telegram message** starts with the urgent+existing-client header, in
  this exact order and join (`sinks.ts`'s `telegramText`: urgent checked
  before existing_client):
  ```
  🔴 URGENT — 🔴 EXISTING CLIENT
  <call summary>

  Name: Mike
  Business: Thompson Logistics
  Process: <process summary>
  Phone: <given number>
  Email: (not given)

  Transcript: https://elevenlabs.io/app/agents/history/<conversation_id>
  ```

---

## Scenario 5 — Rambler → ~5 minute soft wrap

**Caller:** Answers every question with a long, wandering story that
circles back to weather, kids' soccer schedule, a recent vacation, etc.,
before eventually (if ever) getting to the actual answer. Keeps this up for
several minutes without giving Ava a clean opening.

**Pass criteria:**
- The call does not run indefinitely. Once the conversation is running
  around the ~5-minute mark, Ava proactively steers to a close: summarizes
  whatever was actually captured (even if incomplete) and gives the
  callback promise, rather than continuing to chase every field.
- Ava does not fabricate values for fields the rambler never actually
  answered — missing fields stay empty/false, not guessed.
- Ava's turns stay within the two-sentence cap throughout, even while
  redirecting a rambling caller.
- **Netlify form row**: whatever subset of `name`/`business`/`process`/
  `email` the caller actually confirmed; blanks for the rest;
  `phone=<caller's number>` (always available from call metadata even if
  never explicitly confirmed) is expected to still populate if Ava got to
  the confirm-number step before wrapping — if she wrapped before reaching
  it, `phone` may be blank too, which is an acceptable outcome of the soft
  wrap, not a bug.
- **Telegram message**: no `🔴` prefixes unless the rambler happened to
  mention urgency/being a client; body reflects the same partial data as
  the Netlify row.

---

## Scenario 6 — Abusive caller → polite close

**Caller:** Opens hostile: uses profanity, says something like "this is
[expletive] stupid, get me a real person right [expletive] now" and
continues being rude/dismissive to whatever Ava says.

**Pass criteria:**
- Ava never mirrors hostility, never argues, never raises her tone (no
  audible-equivalent escalation in the transcript's wording).
- Ava does not offer a live transfer (same hard rule as Scenario 3) even
  under pressure.
- If the caller keeps refusing to engage constructively, Ava closes the
  call politely and briefly rather than continuing to press through every
  intake question — a short, calm close is acceptable even with an
  incomplete intake.
- No fabricated data: if the caller never gave a name/business/process,
  those fields stay empty rather than guessed from the abusive text.
- **Netlify form row**: likely mostly blank (`name=`, `business=`,
  `process=`, `email=`) except `phone=<caller's number>` from call
  metadata; `source=phone-intake` still set — this is expected, not a
  failure, since `netlifySink` always fires with whatever the lead object
  holds (empty strings, not skipped) as long as the call connected and
  ended normally.
- **Telegram message**: fires with the same mostly-`(not given)` body; no
  `🔴` prefixes unless the caller happened to claim urgency/existing-client
  status. This is still useful signal to a human (an abusive call came in)
  even with no captured lead detail.

---

## Execution status

Not yet run — gated on the ElevenLabs API key per the checklist above. Once
the key exists and the checklist through voice-pick + webhook wiring is
complete, run all six here, record pass/fail + any prompt fixes made, and
re-run until all six pass before considering Task 5 done end-to-end.
