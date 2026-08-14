# Answers Funnel — content engine + lead funnel design

Date: 2026-08-14. Extends the 90-day marketing plan
(`2026-07-29-uptimize-marketing-plan-design.md`); does not replace it.
Grounded in the Uptimize AEO self-audit of 2026-08-13 (ai-visibility repo,
run `uptimize-consulting/2026-08-13`): 0 mentions in 128 customer answers,
0% own-site citation, brand entity intact (16/16 brand checks). The giants
(OpenAI, IBM, McKinsey, Deloitte) own generic questions; winnable ground is
long-tail, specific, and local.

## Decisions (made 2026-08-14 with Jonathan)

1. **Funnel = two tiers, one money CTA.** Top of funnel: `/answers/` Q&A hub,
   /insights/ articles, Reddit, Google Business Profile + Yelp. Bottom:
   `/starter/` ($1,000 Starter) is THE conversion action everywhere. No free
   AI-visibility-scan lead magnet for now — Jonathan wants the deeper
   engagement the paid Starter creates.
2. **Velocity: burst + weekly.** One-time burst of ~12 hub pages (drafted by
   Claude, reviewed by Jonathan in one sitting), then 2/week through the
   existing marketing-agent Wednesday pattern, re-pointed at the remaining
   question backlog.
3. **Reddit: draft + Telegram approve.** The sales agent finds threads and
   drafts disclosed replies in Jonathan's voice; each is sent to Telegram for
   one-tap approval before anything is posted. Never fully automatic — ban
   risk, FTC disclosure risk, and the email-gate precedent all apply.
4. **Paid ads: launch as already specced** (`docs/marketing/ad-experiment.md`,
   unchanged): $300/mo FB+Google → /starter/, Umami-judged, kill criterion
   intact. Ads do not point at /answers/.
5. **Local listings workstream added:** Google Business Profile + Yelp for
   Uptimize itself. Local, cheap, and both are citation sources AI answers use.
6. **Ownership: the sales agent on .153** runs the funnel operationally
   (its remit already covers daily lead check, Monday brief, Wednesday
   article).
7. **Approach A now, B preserved** (see "The B path" below).

## Architecture

```
traffic sources                conversion              measurement
---------------                ----------              -----------
/answers/ hub  ─┐
/insights/      ├──"I build this for small business,
Reddit replies  │   flat $1,000, one week" ──→ /starter/ form
GBP + Yelp     ─┘                                  │
FB/Google ads ────────────────────────────────────→┘
                                            Netlify Forms → sales agent 9am check
Umami events: answer-view · answer-cta-click · starter-form-submit (per UTM/source)
```

## The /answers/ hub

- **URL scheme:** `/answers/<slug>/` one page per question;
  `/answers/` index lists all questions grouped by topic.
- **Page anatomy (AEO-tuned, same for every page):**
  - Question as the H1, phrased the way people ask assistants.
  - Direct 2–3 sentence answer in the first paragraph, with "Uptimize
    Consulting" named inside a quotable sentence (the entity-attribution fix
    from the audit playbook).
  - Body: real numbers, concrete examples, honest trade-offs. Each page is
    written against the verbatim AI answers-to-beat captured in the audit —
    not generic filler.
  - `FAQPage` + `Article` JSON-LD schema; author block (Jonathan Keret,
    linked identity).
  - Internal links: 2–3 related answers + the Starter bridge CTA.
  - Same static-HTML pattern as /insights/ (no build system, Netlify deploy).
- **Copy rules:** first-person "I" voice; no client names or deal sizes in
  public copy; no em-dashes in client-facing prose.

## Burst question list (12)

Selection criteria: winnable (long-tail/specific/local, not McKinsey-owned
generics), Starter-adjacent intent (asker is a plausible $1K buyer), audience
coverage. From the audit matrix + runbook queue:

1. How much does AI workflow automation cost for a small business?
2. What processes should a small business automate first? (runbook queue #3)
3. How long does it take to build a custom business app? (runbook queue #4)
4. Can AI automate invoice processing and order entry?
5. What can an "AI employee" actually do for a small business?
6. Do I need technical expertise to use AI in my business?
7. Can AI integrate with my existing CRM or ERP?
8. What ROI should a small business expect from AI, and how fast?
9. How can AI help a local business generate more leads?
10. AI chatbots for customer support: what's realistic for a small business?
11. How to choose an AI consultant in Chicago (local)
12. Affordable AI consulting near Naperville: what $1,000 actually buys (local)

The remaining ~24 audit questions become the weekly backlog, ordered by the
same criteria.

## Workstreams

- **W1 — Hub burst:** Claude drafts all 12 pages + /answers/ index in the site
  repo; Jonathan reviews in one sitting; publish via push-to-main (Netlify).
  Umami events wired on every page.
- **W2 — Weekly cadence:** runbook Tier-3 section updated: the sales agent's
  Wednesday draft now comes from the question backlog (2/week), same
  review-then-publish flow.
- **W3 — Reddit (draft + approve):** sales agent watches target subreddits
  (r/smallbusiness, r/Entrepreneur, r/nocode, Chicago-area subs); when an
  /answers/ page genuinely answers a live thread, it drafts a disclosed reply
  in Jonathan's voice and sends it to Telegram for approval. Approved replies
  are posted (by Jonathan, or by the agent only after the per-post approval).
  Target ~1–2 replies/week; never link-drop without answering the question.
- **W4 — Local listings:** create/claim Google Business Profile and Yelp
  listings for Uptimize Consulting (Naperville/Chicago service area),
  categories + services + description aligned with the /answers/ topics.
  One-time setup, then reviews encouraged organically.
- **W5 — Ads:** launch the existing ad experiment unchanged on its own
  schedule (~2026-08-19).
- **W6 — Measurement loop:** Umami funnel per page (answer-view →
  answer-cta-click → starter-form-submit); monthly portal re-audit of the
  uptimize tenant measures AI mentions/citations; the sales agent's Monday
  brief gains a funnel section (top pages, CTA clicks, leads by source,
  Reddit outcomes).

## The B path (preserved, not built now)

B = the productized version of this exact exercise: a customer sees their
AEO report ("you render a report, I see the AEO, now fix it") and buys a
content sprint. The A-pattern IS the method B automates:

- Input: any tenant's audit (questions + verbatim answers-to-beat + advice.json
  guides already generated per question).
- Engine: generate /answers/-style page drafts for the CLIENT's site from
  their audit data, using the same page anatomy and selection criteria above.
- The existing `render-plan.mjs` consolidation + per-move prompts in the
  ai-visibility repo are the seed of this engine.
- Trigger to build B: first client engagement that includes content
  execution (or Eli-style portal productization resuming).

## Risks

- **Thin-content risk:** 12 quality pages at once on an established small site
  is safe; 40 overnight would not be. Weekly cadence maintains freshness.
- **Voice drift:** everything passes Jonathan's review before publish; agent
  drafts, never publishes.
- **Reddit account risk:** disclosed identity, answer-first replies,
  per-post human approval. No automation of the posting itself without the
  approval gate.
- **Measurement honesty:** judge pages by Umami + monthly audit trend, not
  by publish count.

## Success criteria (90 days)

- /answers/ hub live with 12 pages, growing 2/week.
- Uptimize mention rate in the monthly self-audit moves off 0% (first target:
  any non-zero, matching the "specific question" pages).
- ≥1 qualified Starter lead attributable to an answers page or Reddit reply
  (Umami source data).
- GBP + Yelp live; ads experiment runs to its own kill/continue criterion.
