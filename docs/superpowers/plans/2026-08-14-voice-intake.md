# Voice Intake Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 630 line answered 24/7 by "Ava" (ElevenLabs agent), every completed call landing as a `starter-project` lead + Telegram alert (+ best-effort CRM lead), with an OpenAI Realtime lab route fenced off from funnel metrics.

**Architecture:** ElevenLabs-hosted agent natively attached to a Twilio number (no server in the call path); post-call webhook → `uptimize-voice-hook` Cloudflare Worker → adapter normalizes to a stack-agnostic lead contract → three independent sinks. Mirrors the proven LaneFit/Kristina pattern (`~/Development/lanefit/worker/`, `agent/`) on Jonathan's own accounts.

**Tech Stack:** Cloudflare Worker (TypeScript, Wrangler, Vitest), ElevenLabs Agents API, Twilio, Telegram Bot API, Netlify Forms, Uptimize CRM API behind Cloudflare Access.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-14-voice-intake-design.md`. Reference implementation to mirror (READ, never modify): `/Users/jonathankeret/Development/lanefit/worker/src/` and `/Users/jonathankeret/Development/lanefit/agent/create-agent.sh`.
- Greeting, verbatim: `Thanks for calling Uptimize Consulting — let's build something great. I'm Ava, the AI assistant here. How can I help?`
- Canon numbers (the ONLY prices/timelines the agent may say): $1,000 starter delivered in about two weeks; $10,000 to $25,000+ typical build over four to eight weeks; $30,000 to $75,000 and up compliance-heavy; $300 to $1,500 per month care.
- Lead contract field names, exact: `name, business, process, callback_number, email, urgent, existing_client, summary, transcript_url, source, brain`. `source` is always `phone-intake`; `brain` is `elevenlabs` or `openai-lab`.
- No live transfer in any path. Callback promise wording: "Jonathan will call you back within one business day."
- Lab calls (`brain=openai-lab`) go to the Telegram sink ONLY — never the Netlify or CRM sinks.
- Secrets (EL API key + webhook secret, Telegram bot token/chat id, CF Access client id/secret, CRM credentials) live as Worker secrets or EL dashboard config — never in git. `voice/worker/.dev.vars` is gitignored.
- Netlify form target: POST `https://uptimizeconsulting.ai/` with `form-name=starter-project` (Netlify convention: urlencoded POST to any site path registers against the form parsed at deploy).
- Umami/analytics untouched by this plan.
- Worker name: `uptimize-voice-hook`. All new code under `voice/`; site pages untouched except the one hidden input in Task 1.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Voice canon + form source field

**Files:**
- Modify: `scripts/build-bot-knowledge.mjs` (add third output)
- Modify: `starter/index.html` (hidden `source` input)
- Create (generated): `docs/marketing/voice-canon.md`

**Interfaces:**
- Produces: `docs/marketing/voice-canon.md` — consumed verbatim by Task 5's prompt assembly. Contains: canon pricing block + the five FAQ digest (what does it cost; how long; what to automate first; do I need to be technical; how do we start), each answer ≤3 sentences, phone-speakable (no URLs read aloud except "uptimizeconsulting dot ai slash starter").

- [ ] **Step 1:** In `scripts/build-bot-knowledge.mjs`, after the existing two `writeFileSync` calls, add a third output built from the same kb-base content:

```js
// Voice-speakable canon digest for the phone agent (Task: voice intake).
// Deliberately short: a voice prompt carries ~1 page, not the whole KB.
const kbBase = readFileSync("docs/marketing/kb-base.md", "utf8");
const section0 = (kbBase.match(/## 0\.[\s\S]*?(?=\n---)/) ?? [""])[0].trim();
const voiceFaq = `## Five questions callers ask (answers, phone-speakable)

**What does it cost?** Most engagements begin with the one thousand dollar Starter: one painful manual process automated, delivered in about two weeks, fixed price. Bigger multi-process builds run ten to twenty-five thousand plus, and compliance-heavy work runs thirty to seventy-five thousand and up.

**How long does it take?** The Starter takes about two weeks. A typical platform build takes four to eight weeks.

**What should I automate first?** The task that happens most often, follows the same steps every time, and already lives somewhere digital, like a spreadsheet or an inbox.

**Do I need to be technical?** No. Most clients are operators, not engineers. Jonathan translates the technical decisions into business decisions.

**How do we start?** A free thirty minute call with Jonathan. I can take your details right now and he will call you back within one business day.`;
writeFileSync("docs/marketing/voice-canon.md", `# Voice canon — phone agent digest\n\n${section0}\n\n---\n\n${voiceFaq}\n`);
console.log("Wrote docs/marketing/voice-canon.md");
```

- [ ] **Step 2:** Run `node scripts/build-bot-knowledge.mjs`. Expected: three "Wrote" lines; open `docs/marketing/voice-canon.md` and confirm section 0 + the five FAQs are present and no line contains a bare URL other than the starter mention.
- [ ] **Step 3:** In `starter/index.html`, inside the `starter-project` form directly after the `bot-field` honeypot line, add: `<input type="hidden" name="source" value="web">`
- [ ] **Step 4:** Run `node scripts/check-answers.mjs` (must stay green — it does not scan starter/, this is a regression guard for the shared repo) and `grep -c 'name="source"' starter/index.html` → 1.
- [ ] **Step 5:** Commit: `git add scripts/build-bot-knowledge.mjs docs/marketing/voice-canon.md starter/index.html && git commit -m "feat(voice): voice canon digest + lead source field on starter form"`

### Task 2: Worker scaffold, HMAC verification, EL adapter

**Files:**
- Create: `voice/worker/package.json`, `voice/worker/wrangler.toml`, `voice/worker/tsconfig.json`, `voice/worker/.gitignore` (containing `.dev.vars`, `node_modules`)
- Create: `voice/worker/src/contract.ts`, `voice/worker/src/hmac.ts`, `voice/worker/src/adapter-elevenlabs.ts`, `voice/worker/src/index.ts`
- Test: `voice/worker/test/hmac.test.ts`, `voice/worker/test/adapter.test.ts`

**Interfaces:**
- Produces: `Lead` type and `parseElevenLabs(payload: unknown): Lead` used by Task 3; `verifySignature(rawBody: string, header: string | null, secret: string, nowSecs: number): Promise<boolean>` used in `index.ts`.
- `wrangler.toml`: `name = "uptimize-voice-hook"`, `main = "src/index.ts"`, `compatibility_date = "2026-08-01"`.

- [ ] **Step 1:** Scaffold: copy `package.json`/`tsconfig.json`/`vitest.config.ts` shapes from `/Users/jonathankeret/Development/lanefit/worker/` (dependencies: wrangler, vitest, typescript, @cloudflare/workers-types; scripts: `test`, `deploy`). Run `npm install` in `voice/worker/`.
- [ ] **Step 2:** `src/contract.ts` — the stack-agnostic lead:

```ts
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
```

- [ ] **Step 3:** Write failing HMAC tests in `test/hmac.test.ts` — port the scheme from `lanefit/worker/src/hmac.ts` (header `ElevenLabs-Signature: t=<ts>,v0=<hex hmac-sha256 of "<ts>.<rawBody>">`; reject stale >30min, future-skew >5min, bad hex, wrong secret; timing-safe compare). Tests: valid signature passes; tampered body fails; stale timestamp fails; missing header fails.

```ts
import { describe, it, expect } from "vitest";
import { verifySignature } from "../src/hmac";

async function sign(body: string, secret: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${ts},v0=${hex}`;
}

describe("verifySignature", () => {
  const body = '{"ok":true}'; const secret = "whsec_test"; const now = 1_760_000_000;
  it("accepts a valid signature", async () => {
    expect(await verifySignature(body, await sign(body, secret, now), secret, now)).toBe(true);
  });
  it("rejects a tampered body", async () => {
    expect(await verifySignature('{"ok":false}', await sign(body, secret, now), secret, now)).toBe(false);
  });
  it("rejects a stale timestamp", async () => {
    expect(await verifySignature(body, await sign(body, secret, now - 31 * 60), secret, now)).toBe(false);
  });
  it("rejects a missing header", async () => {
    expect(await verifySignature(body, null, secret, now)).toBe(false);
  });
});
```

- [ ] **Step 4:** Run `npm test` in `voice/worker/` — expect FAIL (module missing). Implement `src/hmac.ts` (same algorithm as the LaneFit file, self-contained). Run tests → PASS.
- [ ] **Step 5:** Write failing adapter tests in `test/adapter.test.ts`. Build a fixture modeling the EL post-call payload: `{ type: "post_call_transcription", data: { agent_id, conversation_id, analysis: { transcript_summary, data_collection_results: { caller_name: {value}, business_name: {value}, process_description: {value}, callback_number: {value}, email: {value}, urgent: {value}, existing_client: {value} } } } }` (this mirrors `lanefit/worker/src/index.ts`'s extraction of `analysis.data_collection_results`; each result is an object whose `value` holds the extracted datum). Tests: full payload maps to a complete `Lead` with `brain: "elevenlabs"`, `source: "phone-intake"`, `transcript_url` = `https://elevenlabs.io/app/agents/history/<conversation_id>`; missing fields become empty strings / false; boolean-ish strings ("true"/"yes") coerce to true for `urgent`/`existing_client`.
- [ ] **Step 6:** Implement `src/adapter-elevenlabs.ts` (`parseElevenLabs`). Run tests → PASS.
- [ ] **Step 7:** `src/index.ts` v1: single route `POST /postcall` — read raw body, `verifySignature` with `env.ELEVENLABS_WEBHOOK_SECRET` (401 on failure), parse, `parseElevenLabs`, `console.log` the lead (sinks arrive in Task 3), return 200. Non-POST or other paths → 404.
- [ ] **Step 8:** Full `npm test` green. Commit: `git add voice/worker && git commit -m "feat(voice): worker scaffold — HMAC verify + EL adapter to lead contract"`

### Task 3: The three sinks + fan-out

**Files:**
- Create: `voice/worker/src/sinks.ts`
- Modify: `voice/worker/src/index.ts`
- Test: `voice/worker/test/sinks.test.ts`

**Interfaces:**
- Consumes: `Lead` from Task 2.
- Produces: `deliverLead(lead: Lead, env: Env, fetchImpl?: typeof fetch): Promise<{netlify: boolean, telegram: boolean, crm: boolean}>`. `Env` gains: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NETLIFY_SITE_URL` (var, `https://uptimizeconsulting.ai`), `CRM_BASE_URL`, `CRM_EMAIL`, `CRM_PASSWORD`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` (all optional except Telegram pair — sinks skip cleanly when unconfigured).

- [ ] **Step 1:** Write failing tests in `test/sinks.test.ts` with an injected mock `fetchImpl` capturing requests:
  - Netlify sink: urlencoded POST to `NETLIFY_SITE_URL` with `form-name=starter-project`, `name`, `email`, `phone` (=callback_number), `business`, `process`, `source=phone-intake`. Skipped entirely (and reported `netlify:false` without an error ping) when `lead.brain === "openai-lab"`.
  - Telegram sink: POST `https://api.telegram.org/bot<t>/sendMessage` with `chat_id`, text containing the summary, all captured fields, and the transcript link; text starts with `🔴 URGENT` when `lead.urgent`, `🔴 EXISTING CLIENT` when `lead.existing_client`, `🧪 LAB` when `brain === "openai-lab"`.
  - CRM sink: login POST to `${CRM_BASE_URL}/auth/login` carrying `CF-Access-Client-Id`/`CF-Access-Client-Secret` headers AND `Origin: <origin of CRM_BASE_URL>` (both required — port the recipe from `lanefit/worker/src/crm.ts`), then lead-create POST with the same headers + session/JWT from login. Skipped when CRM vars unset or `brain === "openai-lab"`.
  - Fan-out: `Promise.allSettled`; one sink throwing doesn't stop the others; any sink failure triggers ONE extra Telegram error ping (unless Telegram itself failed — then `console.error` only).
- [ ] **Step 2:** Run tests → FAIL. Implement `src/sinks.ts`. Keep each sink its own function ≤40 lines; `deliverLead` composes them.
- [ ] **Step 3:** Wire into `index.ts`: after parsing, `ctx.waitUntil(deliverLead(lead, env))` and immediate 200 (webhook must never wait on sinks). Tests green.
- [ ] **Step 4:** Commit: `git add voice/worker && git commit -m "feat(voice): netlify/telegram/crm sinks with isolated fan-out"`

### Task 4: Deploy worker + provision secrets + CF Access service token

**Files:**
- Create: `voice/worker/PROVISION.md` (the exact commands run, secrets referenced by name only)

**Interfaces:**
- Produces: live worker URL `https://uptimize-voice-hook.<subdomain>.workers.dev` used by Task 5's webhook registration; CF Access service token accepted by the CRM's Access app.

- [ ] **Step 1:** Create the CF Access service token via API (admin token at `~/.cloudflare/admin-token`, account `d47964e01812b7a90536c6c5b47d1d2b`): `POST /accounts/:acct/access/service_tokens` name `uptimize-voice-hook`. Record client id; the secret is shown once — pipe it straight into `wrangler secret put CF_ACCESS_CLIENT_SECRET`.
- [ ] **Step 2:** Add a non-identity Access policy to the CRM's Access app (find app by domain `crm.uptimizeconsulting.ai` via `GET /accounts/:acct/access/apps`): decision `non_identity`, include `{"service_token": {"token_id": "<id>"}}`. Do NOT touch existing allow policies.
- [ ] **Step 3:** In the CRM, create a dedicated low-privilege user for the worker (email `voice-hook@uptimize.local`) via the established admin path (`docker exec uptimize-crm-api-1 ...` recipes in the CRM memory/docs). Store creds only as Worker secrets.
- [ ] **Step 4:** `wrangler deploy` from `voice/worker/`; then `wrangler secret put` for `ELEVENLABS_WEBHOOK_SECRET` (placeholder until Task 5 yields the real one), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRM_*`, `CF_ACCESS_CLIENT_ID/SECRET`; `NETLIFY_SITE_URL` as a plain var in wrangler.toml.
- [ ] **Step 5:** Verify: (a) `curl -X POST <worker>/postcall` with garbage → 401; (b) service token works: `curl -H "CF-Access-Client-Id: ..." -H "CF-Access-Client-Secret: ..." https://crm.uptimizeconsulting.ai/` → NOT the Access login HTML; (c) a hand-signed test payload (sign with the placeholder secret, node one-liner) → 200 and a Telegram message arrives.
- [ ] **Step 6:** Write PROVISION.md documenting every command with secret VALUES omitted. Commit.

### Task 5: ElevenLabs agent "Ava"

**Files:**
- Create: `voice/agent/agent-config.json`, `voice/agent/create-agent.sh`, `voice/agent/build-prompt.mjs`, `voice/agent/test-calls.md`
- Consumes: `docs/marketing/voice-canon.md` (Task 1), worker URL + webhook secret flow (Task 4).

**Blocked-on-Jonathan inputs:** new Uptimize ElevenLabs account API key; (later) ported number attach. Everything below is buildable and browser-testable the moment the key exists.

- [ ] **Step 1:** `build-prompt.mjs`: assembles the system prompt from three parts and writes it into `agent-config.json`'s `conversation_config.agent.prompt.prompt`: (1) role/persona block (verbatim greeting as `first_message`; openly AI; warm, concise, never more than two sentences per turn; no live transfer ever; callback promise wording exact); (2) intake procedure (collect name → business → the process that eats their week → confirm callback number, offering the caller's number back → optional email; confirm summary back to caller; set urgency/existing-client flags when heard); (3) the whole of `voice-canon.md`. Also: answer only from canon; anything else → "that's exactly the kind of thing Jonathan will cover on the callback."
- [ ] **Step 2:** `agent-config.json` modeled on `lanefit/agent/agent-config.json` (strip language_presets — English only v1): TTS voice left as a placeholder id chosen in Step 4; `platform_settings.data_collection` fields exactly: `caller_name`, `business_name`, `process_description`, `callback_number`, `email` (strings), `urgent`, `existing_client` (booleans), each with extraction descriptions; post-call webhook per the LaneFit doc-verification notes (workspace Settings fallback documented in the script header).
- [ ] **Step 3:** `create-agent.sh`: port from LaneFit's (create vs update via `voice/agent/.agent-id`, strip `_doc_verification`, 2xx check, prints agent id). Endpoints: `POST https://api.elevenlabs.io/v1/convai/agents/create`, `PATCH .../agents/{id}`, header `xi-api-key`.
- [ ] **Step 4 (needs EL key):** Run create; in the EL dashboard pick the voice (shortlist 2-3 professional warm US-English voices, test each with the greeting via "Test agent"), set the webhook to the Task 4 worker URL, copy the real webhook secret into `wrangler secret put ELEVENLABS_WEBHOOK_SECRET`.
- [ ] **Step 5:** `test-calls.md` — the six scripted browser-call scenarios from the spec (happy path; cost question → canon verbatim; human-request → callback promise + flag; existing-client urgent → 🔴 Telegram; rambler → ~5 min wrap; abusive → polite close), each with pass criteria including the Netlify form row and Telegram message payloads.
- [ ] **Step 6:** Execute the six calls (browser test agent), fix prompt as needed, re-run until all pass. Commit config + scripts (never `.agent-id`? — commit it, it's not secret; add webhook secret nowhere).

### Task 6: RUNBOOK + marketing runbook tie-in

**Files:**
- Create: `voice/RUNBOOK.md`
- Modify: `docs/marketing/runbook.md` (one line in the publish steps)

- [ ] **Step 1:** `voice/RUNBOOK.md` modeled on LaneFit's: the number map (630 line = prod EL agent; lab number = OpenAI); weekly minutes check (EL dashboard → usage; top up at 80%); "number misbehaves" → EL Test agent from browser (same brain); "lead didn't land" → EL Conversations has the transcript, check worker logs `npx wrangler tail uptimize-voice-hook`; port status notes; cost expectations (~$25/mo steady state).
- [ ] **Step 2:** In `docs/marketing/runbook.md` build steps, after the bot-knowledge line, add: "The same command regenerates `voice-canon.md`; if canon or FAQs changed, re-run `voice/agent/build-prompt.mjs` and `voice/agent/create-agent.sh` so the phone agent matches the site word for word."
- [ ] **Step 3:** Commit both.

### Task 7: OpenAI lab route

**Files:**
- Create: `voice/worker/src/adapter-openai.ts`, `voice/lab/README.md`
- Modify: `voice/worker/src/index.ts`
- Test: `voice/worker/test/adapter-openai.test.ts`

- [ ] **Step 1:** Failing tests: `parseOpenAILab(payload)` maps a minimal lab payload `{ summary, fields: {name, business, process, callback_number, email, urgent, existing_client}, transcript_url }` (we control this shape — the lab bridge emits it) to a `Lead` with `brain: "openai-lab"`; route `POST /lab/postcall` guarded by header `X-Lab-Token: <env.LAB_TOKEN>` (401 otherwise); delivery for lab leads hits Telegram only (assert via mock fetch that no Netlify/CRM calls happen — Task 3's sinks already enforce this; this test locks it end-to-end through the route).
- [ ] **Step 2:** Implement adapter + route. Tests green. Commit.
- [ ] **Step 3:** `voice/lab/README.md`: exact setup for the lab line — buy temp Twilio number; create Elastic SIP trunk with origination to OpenAI's SIP connector per https://www.twilio.com/en-us/blog/developers/tutorials/product/openai-realtime-api-elastic-sip-trunking ; configure the Realtime session (model `gpt-realtime`, instructions = SAME assembled prompt from `voice/agent/build-prompt.mjs` output, function/tool emitting the lab payload above to `<worker>/lab/postcall` with `X-Lab-Token`); comparison protocol (call both numbers back to back with test-calls.md scenarios); promotion criteria copied from the spec. Mark clearly: requires OpenAI API key + billing — Jonathan-gated.

### Task 8: End-to-end verification (gated on number + EL account)

- [ ] **Step 1:** With the EL agent live on a number (temp Twilio number first if the port is still pending — attach per EL dashboard → agent → phone numbers): place a real phone call, complete the happy-path intake.
- [ ] **Step 2:** Verify within one minute of hangup: Netlify → Forms → starter-project shows the row with `source=phone-intake`; Telegram alert with summary + transcript link; CRM lead exists (if sink c configured). Record evidence in `voice/RUNBOOK.md` under "last verified".
- [ ] **Step 3:** Confirm next 9 AM sales-agent lead check surfaces the test lead (it reads Netlify forms — no change needed; just verify and note in the runbook).
- [ ] **Step 4:** When the 630 port completes: attach the number to the agent, repeat Step 1-2 once, update GBP checklist (`docs/marketing/local-listings.md`) phone field note + KB contact section via `kb-base.md` regeneration. Final commit.

---

## Self-review notes

- Spec coverage: decisions §1-5 → Tasks 4/5 (accounts/persona/escalation/knowledge via prompt), architecture + contract → Task 2, sinks → Task 3, drift prevention → Task 1+6, lab → Task 7, testing → Tasks 2/3/5/8, RUNBOOK → Task 6. Port logistics are Jonathan's; Tasks 5/8 note their gates explicitly rather than hiding them.
- EL payload/API shapes are taken from the working LaneFit implementation and its documented verification trail, not invented; where LaneFit flagged an API ambiguity (per-agent webhook registration), the same fallback (workspace Settings) is carried forward.
- Lab fencing is enforced twice (sink logic + route test) per the Global Constraint.
