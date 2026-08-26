# Marketing Operations Runbook (90-day plan)

Started 2026-07-29. Spec: `docs/superpowers/specs/2026-07-29-uptimize-marketing-plan-design.md`.
Assets live: https://uptimizeconsulting.ai/starter/ (+ one-pager PDF, /insights/).

## Weekly rhythm

**Monday outreach block (60 to 90 min)**
- [ ] Send 3 to 5 notes from `referral-wave.md` (Tier 1) or niche outbound (Tier 2: home-care agencies, mediators/attorneys via Ari)
- [ ] Bump anyone silent for 7+ days (one light bump, then move on)
- [ ] Log every send/reply in Uptimize CRM the same day

**Two answers pages per week (Tier 3, AEO)**
The original /insights/ articles stay live and still count as Tier-3 output:
1. "How much does a custom app for a small business cost?" (2026-07-29)
2. "Custom software vs. off-the-shelf for a small business" (2026-08-06)
Going forward, Tier-3 content is `/answers/` pages pulled from the backlog below
instead of insights articles. Cadence: draft one page Wednesday, publish it
plus one more before the week is out (2/week).

Build process for every new page:
- Copy `answers/_template.html` into a new `answers/<slug>/index.html`
- Fill in the question title, meta description, direct-answer box, FAQ
  JSON-LD, and at least 2 related-answer links to other live pages
- Set the Article JSON-LD `datePublished` to the actual publish date (the
  template hardcodes 2026-08-14, which is only correct on that date)
- Add the new page's `<li>` to `answers/index.html`, after the
  `<!-- ANSWERS-LIST -->` marker, in the same order as the backlog/published list
- Regenerate the bot knowledge pack: `node scripts/build-bot-knowledge.mjs`, then re-upload
  `docs/marketing/bot-knowledge.md` to the InstantAIGuru dashboard. The site bot's
  knowledge is static: it knows nothing about a new page (or a pricing change) until
  this file is rebuilt and re-uploaded.
  The same command regenerates `voice-canon.md`; if canon or FAQs changed, re-run
  `voice/agent/build-prompt.mjs` and `voice/agent/create-agent.sh` so the phone agent
  matches the site word for word.
- Run `node scripts/check-answers.mjs` — it must pass (canonical URL, Umami
  script + `answer-cta-click` event with the right slug, `/starter/` CTA,
  JSON-LD parses, listed on the answers index, no em-dash in the page copy)
  before the page goes live
Pattern: answer the question directly in the first paragraph, real numbers,
one anonymized example, FAQ JSON-LD, CTA to /starter/.

Published (16 live at `/answers/<slug>/`):
1. how-much-does-ai-workflow-automation-cost
2. what-should-a-small-business-automate-first
3. how-long-does-a-custom-business-app-take
4. can-ai-automate-invoice-processing
5. what-can-an-ai-employee-actually-do
6. do-i-need-technical-expertise-for-ai
7. can-ai-integrate-with-my-crm-or-erp
8. what-roi-should-a-small-business-expect-from-ai
9. how-can-ai-help-a-local-business-generate-leads
10. ai-chatbots-for-small-business-customer-support
11. how-to-choose-an-ai-consultant-in-chicago
12. affordable-ai-consulting-near-naperville
13. who-owns-the-software-after-a-custom-app-is-built
14. is-the-1000-starter-project-standalone
15. what-happens-after-the-project-ends
16. do-i-need-to-replace-my-erp-or-systems-to-use-ai

Backlog (next up), from the `uptimize-consulting` AEO audit
(`ai-visibility/tenants/uptimize-consulting.json`, audiences[].queries, minus
the 12 shipped above; brand-check queries dropped — they are not content
topics). Ordered SMB-owner questions first, enterprise last:
1. How can AI benefit my small business?
2. What services do you offer that are tailored for small businesses?
3. Which marketing campaigns are bringing traffic but not converting, and how can AI help fix that?
4. What behavior patterns show a customer is ready to buy, even before they say so?
5. How can AI help create high-quality, SEO-optimized content at scale?
6. When is the best time to post on social media, according to AI insights?
7. How can AI improve marketing optimization for a small business?
8. What AI content creation tools are worth using?
9. How does AI improve customer experience?
10. How can AI improve social media engagement?
11. What similar AI projects have you completed for companies our size and industry?
12. How do you approach the discovery phase before recommending an AI solution?
13. What does your team look like, and who actually does the implementation work?
14. How do you measure success, and what ROI should we expect from a generative AI project?
15. What happens after the engagement ends, and how do we sustain this internally?
16. What is your approach to data security and compliance, especially in regulated industries?
17. How fast can you deploy AI and show value on an enterprise-level project?
18. Do we have to use our cloud vendor's model, or can we deploy open-source models?
19. Do we need to replace our ERP to use AI automation?
20. How will we know what tools and data the AI agent is using for each customer interaction?
21. How does enterprise AI consulting work in Chicago?
22. What should we look for in an AI integration specialist for a large company?

**Weekly pipeline review (15 min)**
- [ ] Conversations this week / total
- [ ] Starter projects sold / in delivery (cap: 2 concurrent)
- [ ] Starter-to-platform conversions in discussion
- [ ] Netlify Forms check: new `starter-project` submissions answered within 24h
- [ ] Umami check (https://analytics.uptimizeconsulting.ai): visitors, top referrers/UTMs, `starter-form-submit` + `consultation-submit` event counts

**From week 4 (~2026-08-19): ads check**
- [ ] Fill the weekly row in `ad-experiment.md` (spend, clicks, submissions)
- [ ] Day-30-of-spend: kill decision per the brief

## Funnel measurement

- Umami (https://analytics.uptimizeconsulting.ai) tracks the answers funnel
  per page: `answer-cta-click` fires on the /starter/ CTA, tagged with the
  page's slug so conversion rate is comparable page to page; `starter-form-submit`
  fires on the Netlify form itself, so slug-to-submit is traceable end to end.
- Monthly: re-run the AEO portal audit for the `uptimize-consulting` tenant
  (same audiences/queries as `ai-visibility/tenants/uptimize-consulting.json`).
  That re-audit is the AEO scoreboard — track whether shipped answers pages
  move the needle on citation/visibility for the queries they target, and let
  newly-surfaced queries feed back into the backlog above.

## 90-day success criteria (from the spec, verbatim)

- 10+ qualified conversations
- 3+ paid $1K starter projects
- 1–2 starter projects converted to $10K+ platform builds
- Ad experiment produces a clear keep/kill verdict at ≤$600 total spend
