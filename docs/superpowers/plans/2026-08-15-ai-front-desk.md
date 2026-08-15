# AI Front Desk Product Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/ai-front-desk/` product page live-ready (deploy gated on Ron's OK), cross-linked from homepage/answers/footer, with the offer taught to the KB so Ava can sell it.

**Architecture:** One static page cloned from the /starter/ pattern; three surgical cross-link edits; one kb-base section update + regeneration. No nav changes, no /starter/ changes, no new scripts.

**Tech Stack:** Static HTML (site conventions), Netlify Forms, Umami, existing build-bot-knowledge.mjs.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-15-ai-front-desk-design.md` — the offer facts, section order, and copy rules there are binding.
- Copy: first-person "I" voice; NO em-dashes in the new page or edited public pages; no client names; canon numbers only — $1,000 setup / "about two weeks" / platform "from $95/month, billed directly by instantAIguru" / care $300 to $1,500 per month.
- Page pattern source: `starter/index.html` (CSS variables, fonts, nav, footer, Umami snippet `data-website-id="a163a740-7152-46d9-9206-1f292ce13579"`, chat-widget script tag, Netlify form mechanics incl. honeypot).
- Form: SAME `form-name=starter-project` markup, hidden `<input type="hidden" name="source" value="ai-front-desk">`, all existing field names unchanged; JS submit handler fires `starter-form-submit` exactly like starter/index.html:213 does.
- Umami CTA event on hero + pricing buttons: `data-umami-event="frontdesk-cta-click"` + `data-umami-event-slug="ai-front-desk"`.
- Demo block: Chat button scrolls/points to the widget bubble (`onclick` that clicks `.iAIgW-chat-icon` if present, else scrolls with a hint); WhatsApp button `https://wa.me/16304451958`; Call button `tel:+16304451958` wrapped in `<!-- PORT-GATED ... -->` comment, NOT rendered.
- Canonical `https://uptimizeconsulting.ai/ai-front-desk/`; `<meta name="robots">` NOT set (this page should index, unlike client reports).
- Disclosure line verbatim: "Uptimize Consulting is an instantAIguru partner."
- Work on branch `ai-front-desk`; do NOT merge to main or push main in any task — the final merge is the controller's, gated on Jonathan's Ron-OK.
- `node scripts/check-answers.mjs` stays green after every task.
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: The page

**Files:**
- Create: `ai-front-desk/index.html`

**Interfaces:**
- Produces: the page at the exact URL /ai-front-desk/ that Task 2's links target.

- [ ] **Step 1:** Read `starter/index.html` fully; clone its head (title "AI Front Desk | Uptimize Consulting", meta description ≤160 chars naming 24/7 answering + $1,000 setup, canonical per constraints, fonts, Umami, widget script) and its nav/footer/CSS. Reuse its card/CTA/form styles; add only minimal new CSS (demo-block button row).
- [ ] **Step 2:** Write the eight sections in the spec's order (hero; "You're talking to one right now" demo block with Ava avatar image embedded as data URI or copied asset from `docs/marketing/`-adjacent `ava-moshi` PNG — copy it to `ai-front-desk/ava.png` and reference relatively; setup contents; pricing cards incl. optional care plan; who it's for / not for; FAQ; form; disclosure). FAQ gets FAQPage JSON-LD (`<script type="application/ld+json">`, exact attribute form) mirroring the six FAQ questions in the spec.
- [ ] **Step 3:** Verify: `python3 -m http.server` render check; JSON-LD parses (`node -e` extract+parse); grep zero `—` in the file; grep the disclosure line, the source input, the two `frontdesk-cta-click` events, `wa.me/16304451958`, and the PORT-GATED comment containing `tel:+16304451958`; `node scripts/check-answers.mjs` green.
- [ ] **Step 4:** Commit `feat(front-desk): product page`.

### Task 2: Cross-links

**Files:**
- Modify: `index.html` (services grid card + footer link)
- Modify: `answers/ai-chatbots-for-small-business-customer-support/index.html` (CTA block second line)

- [ ] **Step 1:** Homepage: find the services `.cards` grid; append one card matching sibling markup exactly (icon 🛎️ or similar existing-style emoji, title "AI Front Desk", one-sentence description "Chat, WhatsApp, and phone answered 24/7 by an AI trained on your business. $1,000 setup.", link → `/ai-front-desk/`). Footer: add `<a href="/ai-front-desk/">AI Front Desk</a>` beside the Answers link. Do NOT touch the nav `<ul>`.
- [ ] **Step 2:** Answers chatbots page: inside its `.cta` block, after the existing button, add: `<p class="note" style="margin-top:10px"><a href="/ai-front-desk/">Want one without building it yourself? See the AI Front Desk.</a></p>` (match the page's existing note/link styling; keep the answers-page contract intact).
- [ ] **Step 3:** Verify: `node scripts/check-answers.mjs` → still `12 pages OK` (the chatbots page must still pass every check); grep the three new hrefs; zero em-dashes introduced.
- [ ] **Step 4:** Commit `feat(front-desk): homepage card, answers cross-link, footer link`.

### Task 3: KB + canon integration

**Files:**
- Modify: `docs/marketing/kb-base.md` (section 5 chatbot Q&A → productized; add "front desk" Q&A)
- Regenerate: `docs/marketing/{bot-knowledge.md,Uptimize_KB_v2.md,voice-canon.md}` via the script

- [ ] **Step 1:** In kb-base section 5, replace the "Can you set up an AI chatbot for my website?" answer with the productized offer (named "AI Front Desk"; $1,000 setup incl. what the spec lists; platform from $95/month billed directly by instantAIguru; about two weeks; "you're talking to the demo right now"; page link https://uptimizeconsulting.ai/ai-front-desk/). Add one new Q&A: "What is the AI Front Desk?" with the same facts. Do NOT touch section 0's numbers except no changes needed (the $95/month from-price lives in these section-5 answers, not section 0).
- [ ] **Step 2:** `node scripts/build-bot-knowledge.mjs`; verify voice-canon.md UNCHANGED (`git diff --stat docs/marketing/voice-canon.md` empty — the digest only reads section 0 + its own FAQ block); verify Uptimize_KB_v2.md contains "AI Front Desk" and the page URL; `node voice/agent/build-prompt.mjs` idempotent (no agent-config diff).
- [ ] **Step 3:** Commit `feat(front-desk): KB teaches Ava to sell the AI Front Desk`. Note in the commit body: Jonathan must re-upload Uptimize_KB_v2.md in the Guru dashboard at launch.

### Task 4: Branch verification

- [ ] **Step 1:** Full pass on the branch: `node scripts/check-answers.mjs`; serve locally and click through / → card → /ai-front-desk/ → form section; JSON-LD of the new page parses; all three cross-link hrefs resolve to the new page; `git diff main --stat` touches ONLY the four files named in Tasks 1-3 (+ ava.png asset).
- [ ] **Step 2:** Do NOT merge. Report ready-for-launch state; the controller merges after Jonathan confirms Ron's OK, then verifies live URLs + regenerated-KB upload reminder.

## Self-review notes

Spec coverage: offer/page/§measurement→Task 1, cross-links→Task 2, canon→Task 3, launch gates→Task 4 + controller. Phone button gating, /starter/ untouched, nav untouched are explicit constraints. No placeholder steps; copy content is fully specified by the spec's section list + canonical facts.
