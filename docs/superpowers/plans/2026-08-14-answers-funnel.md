# Answers Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the /answers/ Q&A hub (12 AEO-tuned pages + index) on uptimizeconsulting.ai, update the marketing runbook to the weekly answers cadence, expand the .153 sales agent's remit (Reddit draft+Telegram-approve, funnel reporting), and hand Jonathan the GBP/Yelp checklist.

**Architecture:** Static HTML pages in the existing Netlify site repo, cloned from the /insights/ article pattern (same CSS, nav, Umami, FAQPage JSON-LD). No build system. A small Node checker script enforces the page contract. Agent-side changes are markdown remit edits + one scheduled task on .153.

**Tech Stack:** Plain HTML/CSS, Umami analytics (self-hosted), Node ≥18 for the checker (no dependencies), Netlify deploy on push-to-main.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-14-answers-funnel-design.md`.
- Copy rules (every page): first-person "I" voice (Jonathan); NO em-dashes anywhere in page copy; NO client names or client deal sizes; public pricing only ($1,000 Starter, $10,000–$25,000 typical build, $300–$1,500/month care — these ARE public, from /insights/).
- Every answers page: direct 2–3 sentence answer in a `.answer` box as the first content block, containing the exact string "Uptimize Consulting" in a quotable sentence.
- Umami website id: `a163a740-7152-46d9-9206-1f292ce13579`; script src `https://analytics.uptimizeconsulting.ai/script.js`. Page views are auto-tracked (no answer-view event needed); the CTA button carries `data-umami-event="answer-cta-click"` and `data-umami-event-slug="<slug>"`.
- Canonical URL = `https://uptimizeconsulting.ai/answers/<slug>/`.
- Source grounding: the verbatim AI answers-to-beat live in `/Users/jonathankeret/Development/ai-visibility/results/uptimize-consulting/2026-08-13/raw.jsonl` (fields: `query`, `provider`, `text`). Extract per question with:
  `node -e "const fs=require('fs');for(const l of fs.readFileSync(process.argv[1],'utf8').split('\n')){if(!l.trim())continue;const r=JSON.parse(l);if(r.query===process.argv[2])console.log('=== '+r.provider+' ===\n'+r.text.slice(0,2500)+'\n')}" /Users/jonathankeret/Development/ai-visibility/results/uptimize-consulting/2026-08-13/raw.jsonl "<exact query text>"`
- .153 access: `ssh -i ~/.ssh/id_ed25519_nopass -o IdentitiesOnly=yes keret@192.168.2.153`.
- Commit after every task; push only in Task 8 (one deploy).

---

### Task 1: Page checker script

Enforces the page contract so the burst AND the future weekly cadence can't drift.

**Files:**
- Create: `scripts/check-answers.mjs`
- Test: run against a deliberately broken fixture, then against nothing (no pages yet → exits 0 with "0 pages").

**Interfaces:**
- Produces: `node scripts/check-answers.mjs` — scans `answers/*/index.html`, exits 1 with per-file errors if any check fails. Later tasks and the agent's weekly flow both run this.

- [ ] **Step 1: Write the checker**

```js
#!/usr/bin/env node
// Contract checker for /answers/ pages. Run: node scripts/check-answers.mjs
// Checks every answers/*/index.html against the funnel spec's page anatomy.
import { readFileSync, readdirSync, existsSync } from "node:fs";

const errors = [];
const dirs = existsSync("answers")
  ? readdirSync("answers", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const slug of dirs) {
  const path = `answers/${slug}/index.html`;
  if (!existsSync(path)) { errors.push(`${slug}: missing index.html`); continue; }
  const html = readFileSync(path, "utf8");
  const err = (m) => errors.push(`${slug}: ${m}`);

  if (!html.includes(`<link rel="canonical" href="https://uptimizeconsulting.ai/answers/${slug}/">`)) err("canonical missing or wrong");
  if (!html.includes('data-website-id="a163a740-7152-46d9-9206-1f292ce13579"')) err("Umami script missing");
  if (!/<div class="answer">/.test(html)) err("no .answer direct-answer box");
  if (!html.includes("Uptimize Consulting")) err("brand not named");
  if (!html.includes('data-umami-event="answer-cta-click"')) err("CTA event missing");
  if (!html.includes(`data-umami-event-slug="${slug}"`)) err("CTA slug attr missing/wrong");
  if (!html.includes('href="/starter/"')) err("no /starter/ CTA link");
  if ((html.match(/href="\/answers\/[a-z0-9-]+\/"/g) ?? []).length < 2) err("fewer than 2 related-answer links");
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) ?? [];
  if (!ld.length) err("no JSON-LD");
  for (const block of ld) {
    try { JSON.parse(block.replace(/<script[^>]*>|<\/script>/g, "")); }
    catch { err("JSON-LD does not parse"); }
  }
  // copy rules: em-dash ban applies to visible copy; strip tags' attributes first is overkill — em-dash anywhere is banned on these pages
  if (html.includes("—")) err("em-dash in page");
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`${dirs.length} pages OK`);
```

- [ ] **Step 2: Verify it passes with no pages**

Run: `node scripts/check-answers.mjs` → expect `0 pages OK`, exit 0.

- [ ] **Step 3: Verify it fails on a broken page**

```bash
mkdir -p answers/zz-test && echo '<html>broken</html>' > answers/zz-test/index.html
node scripts/check-answers.mjs; echo "exit=$?"   # expect multiple errors, exit=1
rm -r answers/zz-test
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check-answers.mjs
git commit -m "feat(answers): page contract checker"
```

### Task 2: Answers page template + first page + hub index

**Files:**
- Create: `answers/_template.html` (the copy-me skeleton, underscore = not a route)
- Create: `answers/how-much-does-ai-workflow-automation-cost/index.html`
- Create: `answers/index.html`
- Modify: `index.html` (site nav/footer: add one link to /answers/)

**Interfaces:**
- Consumes: checker from Task 1.
- Produces: the template every later page copies; the index page that Task 3 adds links into (marker comment `<!-- ANSWERS-LIST -->` inside `<ul class="qlist">`).

- [ ] **Step 1: Create `answers/_template.html`** — exact skeleton (placeholders in UPPERCASE are filled per page; everything else ships verbatim). Head/nav/footer/CSS are copied from `insights/how-much-does-a-custom-app-cost/index.html` with these deltas:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QUESTION_TITLE | Uptimize Consulting</title>
<meta name="description" content="META_DESCRIPTION_150_CHARS">
<link rel="canonical" href="https://uptimizeconsulting.ai/answers/SLUG/">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script defer src="https://analytics.uptimizeconsulting.ai/script.js" data-website-id="a163a740-7152-46d9-9206-1f292ce13579"></script>
<style>/* copy the entire <style> block from insights/how-much-does-a-custom-app-cost/index.html unchanged */</style>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "QUESTION_TITLE",
      "acceptedAnswer": { "@type": "Answer", "text": "DIRECT_ANSWER_TEXT" } }
    /* + 2-3 more Question entries matching the page's H2 sections */
  ]
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "QUESTION_TITLE",
  "author": { "@type": "Person", "name": "Jonathan Keret", "url": "https://uptimizeconsulting.ai" },
  "publisher": { "@type": "Organization", "name": "Uptimize Consulting", "url": "https://uptimizeconsulting.ai" },
  "datePublished": "2026-08-14",
  "mainEntityOfPage": "https://uptimizeconsulting.ai/answers/SLUG/"
}
</script>
</head>
<body>
<nav><div class="wrap"><a href="/"><img src="/assets/logo.svg" alt="Uptimize Consulting" onerror="this.outerHTML='<strong style=color:#fff>Uptimize</strong>'"></a><a class="back" href="/answers/">← All answers</a></div></nav>
<main>
<span class="kicker">ANSWERS · AUDIENCE_LABEL</span>
<h1>QUESTION_TITLE</h1>
<div class="answer"><p>DIRECT_ANSWER_TEXT (2-3 sentences, names "Uptimize Consulting" in a quotable sentence)</p></div>

<!-- BODY: 3-5 H2 sections, real numbers, honest trade-offs, written to beat the
     verbatim AI answers for this question (see Global Constraints for extraction) -->

<h2>Related questions</h2>
<ul>
  <li><a href="/answers/RELATED_SLUG_1/">RELATED_QUESTION_1</a></li>
  <li><a href="/answers/RELATED_SLUG_2/">RELATED_QUESTION_2</a></li>
</ul>

<div class="cta">
<h2>This is exactly what I build</h2>
<p>I take one painful manual process and automate it for a flat $1,000, delivered in about a week. If it earns its keep, we grow from there.</p>
<a class="btn" href="/starter/" data-umami-event="answer-cta-click" data-umami-event-slug="SLUG">See the $1,000 Starter →</a>
</div>
</main>
<footer>© 2026 Uptimize Consulting · Naperville, IL · <a href="/">uptimizeconsulting.ai</a></footer>
</body>
</html>
```

Before saving the template, open `insights/how-much-does-a-custom-app-cost/index.html` and copy its real `<style>` block and real `<nav>` logo markup into the template (the nav sketch above is a fallback; match the live article exactly).

- [ ] **Step 2: Write the first page** `answers/how-much-does-ai-workflow-automation-cost/index.html` from the template. Content brief: audience "Small business owners"; extract the answers-to-beat for query `"How much does AI workflow automation cost and what's the typical implementation timeline?"` (Global Constraints command); the AI answers today quote enterprise-consulting ranges — beat them with concrete small-business numbers: $1,000 single-process starter (1 week), $10,000–$25,000 multi-process platform (4–8 weeks), $300–$1,500/month care; sections: what drives cost, what a $1,000 project actually covers, timeline expectations, when NOT to automate. Related links: `what-should-a-small-business-automate-first`, `how-long-does-a-custom-business-app-take`.

- [ ] **Step 3: Create `answers/index.html`** — same head/nav/footer pattern (canonical `/answers/`, no FAQPage schema, Article schema omitted). Body: h1 "Straight answers about AI for small business", intro paragraph (I voice), then:

```html
<ul class="qlist">
<!-- ANSWERS-LIST -->
<li><a href="/answers/how-much-does-ai-workflow-automation-cost/">How much does AI workflow automation cost?</a></li>
</ul>
```

plus the same `.cta` block (event slug `index`). Add `.qlist li{margin-bottom:12px;font-weight:600}` to its style block.

- [ ] **Step 4: Add nav link on the homepage** — in `index.html`, find the footer/nav link cluster that references `/insights/` and add `<a href="/answers/">Answers</a>` beside it (match surrounding markup exactly).

- [ ] **Step 5: Verify** — `node scripts/check-answers.mjs` → `1 pages OK`. Then `python3 -m http.server 8111 &` and load `http://localhost:8111/answers/how-much-does-ai-workflow-automation-cost/` — renders styled, CTA present; kill the server.

- [ ] **Step 6: Commit**

```bash
git add answers/ index.html
git commit -m "feat(answers): hub index + template + first page"
```

### Task 3: The remaining 11 pages

**Files:** one directory per row below (`answers/<slug>/index.html`), plus one `<li>` per page added at the `<!-- ANSWERS-LIST -->` marker in `answers/index.html`.

**Interfaces:** consumes the Task 2 template + Task 1 checker. Every page follows the Task 2 Step 2 procedure: extract answers-to-beat → draft against them → checker passes.

Page table (slug · H1 · audit query for extraction · audience label · related slugs):

| # | slug | H1 / audit query | audience | related |
|---|------|------------------|----------|---------|
| 2 | what-should-a-small-business-automate-first | "What processes should a small business automate first?" (runbook queue; no audit query — ground in pages 1 and 4 answers) | Small business owners | 1, 4 |
| 3 | how-long-does-a-custom-business-app-take | "How long does it take to build a custom business app?" (runbook queue; ground in audit query "How much does AI workflow automation cost and what's the typical implementation timeline?") | Small business owners | 1, 2 |
| 4 | can-ai-automate-invoice-processing | audit query "How can AI help automate repetitive tasks like invoice processing or order entry?" | Small business owners | 2, 5 |
| 5 | what-can-an-ai-employee-actually-do | audit query "What tasks can an AI employee perform?" | Small business owners | 4, 6 |
| 6 | do-i-need-technical-expertise-for-ai | audit query "Do I need technical expertise to use your AI solutions?" (generalize: "to use AI in my business") | Small business owners | 5, 7 |
| 7 | can-ai-integrate-with-my-crm-or-erp | audit query "Can your AI services integrate with my existing systems like CRM or ERP?" (generalize) | Small business owners | 6, 8 |
| 8 | what-roi-should-a-small-business-expect-from-ai | audit query "What is the expected ROI and how quickly can we see results from AI implementation?" | Small business owners | 1, 7 |
| 9 | how-can-ai-help-a-local-business-generate-leads | audit query "AI solutions for lead generation in {geo}" → use the Chicago-expanded variant in raw.jsonl | Marketing | 10, 11 |
| 10 | ai-chatbots-for-small-business-customer-support | audit query "How can AI-powered chatbots enhance customer support and engage customers 24/7?" | Marketing | 9, 5 |
| 11 | how-to-choose-an-ai-consultant-in-chicago | audit query "AI consulting for small businesses in Chicago, IL" (raw.jsonl geo variant) | Local | 12, 1 |
| 12 | affordable-ai-consulting-near-naperville | audit query "affordable AI solutions for businesses" + local angle; explicitly answer "what $1,000 actually buys" | Local | 11, 1 |

- [ ] **Step 1: Draft pages 2–5** (extraction → draft → per-page `node scripts/check-answers.mjs`), add their index `<li>` entries.
- [ ] **Step 2: Commit** — `git add answers/ && git commit -m "feat(answers): pages 2-5"`
- [ ] **Step 3: Draft pages 6–9**, index entries, checker green.
- [ ] **Step 4: Commit** — `git commit -am "feat(answers): pages 6-9"`
- [ ] **Step 5: Draft pages 10–12**, index entries, checker green (`12 pages OK`).
- [ ] **Step 6: Verify related-links integrity** — every `related` slug in the table exists; checker's ≥2-related-links rule passes on all 12.
- [ ] **Step 7: Commit** — `git commit -am "feat(answers): pages 10-12 — burst complete"`

### Task 4: Runbook update (weekly cadence)

**Files:**
- Modify: `docs/marketing/runbook.md` (Tier-3 / article section)

- [ ] **Step 1: Rewrite the Tier-3 section**: articles come from the answers backlog now; cadence 2/week (Wednesday draft + one more); every new page copies `answers/_template.html` and must pass `node scripts/check-answers.mjs` before publish; list the published 12 slugs; add "Backlog (next up)" — the ~24 remaining audit questions (list them, extracted from `/Users/jonathankeret/Development/ai-visibility/tenants/uptimize-consulting.json` audiences, minus the 12 shipped), ordered: SMB-owner questions first, enterprise last.
- [ ] **Step 2: Add a "Funnel measurement" subsection**: Umami events (`answer-cta-click` by slug, `starter-form-submit`), monthly portal re-audit of the `uptimize-consulting` tenant as the AEO scoreboard.
- [ ] **Step 3: Commit** — `git commit -am "docs(runbook): answers cadence + backlog + funnel measurement"`

### Task 5: GBP + Yelp checklist (Jonathan-facing)

**Files:**
- Create: `docs/marketing/local-listings.md`

- [ ] **Step 1: Write the checklist** — Google Business Profile: create at business.google.com as "Uptimize Consulting", category "Business management consultant" (secondary: "Computer consultant"), service-area business (Naperville + Chicago metro, no storefront address shown), services list mirroring the answers topics (AI workflow automation, custom business apps, AI consulting), description in I-voice naming the $1,000 Starter, link `https://uptimizeconsulting.ai/starter/`, phone + verification (postcard/phone — Jonathan only). Yelp: biz.yelp.com claim, same category/description/link, skip all paid upsells. Both: add as citation targets for future review pushes; note in runbook Monday block "ask one happy contact for a GBP review" once live.
- [ ] **Step 2: Commit** — `git commit -am "docs: GBP + Yelp setup checklist"`

### Task 6: Sales agent remit on .153 (Reddit gate + funnel brief)

**Files (on .153, edit over ssh):**
- Modify: `~/claudeclaw-v2/agents/sales/CLAUDE.md` (marketing section, ~lines 111–208)
- Create: `~/claudeclaw-v2/agents/sales/notes/marketing/reddit-state.json` (`{"replied_threads": [], "subreddits": ["smallbusiness", "Entrepreneur", "nocode", "sweatystartup", "ChicagoSuburbs"]}`)
- Insert one row in the scheduled-tasks store (model it on the existing `marketing-brief-weekly` row: first `SELECT * FROM scheduled_tasks WHERE id LIKE 'marketing%'` to copy the exact schema/columns, then INSERT `reddit-scan-twiceweekly`, cron `0 10 * * 2,4`, same chat delivery as the Monday brief).

- [ ] **Step 1: Append the Reddit remit to CLAUDE.md** (exact text to add):

```markdown
## Reddit (draft + approve — NEVER post autonomously)

Twice a week (reddit-scan-twiceweekly), search the subreddits in
notes/marketing/reddit-state.json for live threads (newer than 48h) where one
of our /answers/ pages genuinely answers the question being asked. For at most
2 threads: draft a reply in Jonathan's voice that (1) answers the question
directly and completely in the reply itself, (2) discloses "I run an AI
consulting shop" naturally, (3) links the /answers/ page only if it adds real
depth. Send each draft to Jonathan on Telegram as: thread URL, thread title,
the draft, and "reply YES to approve". You NEVER post to Reddit yourself —
Jonathan posts approved replies. Log handled thread URLs in reddit-state.json
(replied_threads) so they are never re-suggested. Skip weeks with no genuine
fit; a forced reply is worse than none.

## Monday brief: funnel section

Add to the weekly Monday brief: (1) Umami last-7-days — answer-cta-click
count by slug and starter-form-submit count (POST /api/auth/login on
https://analytics.uptimizeconsulting.ai with the credentials in
notes/marketing/umami-credentials.json, then GET
/api/websites/a163a740-7152-46d9-9206-1f292ce13579/events grouped by event
name); (2) new answers pages published this week (git log of site-repo
answers/); (3) Reddit: drafts sent / approved / posted; (4) leads by source
(existing Netlify check) noting any with answers/reddit/ads UTM or referrer.
```

- [ ] **Step 2: Provision Umami credentials for the agent** — copy the admin credentials from the Mac (`~/.umami-credentials`) into `~/claudeclaw-v2/agents/sales/notes/marketing/umami-credentials.json` on .153 as `{"username": "...", "password": "..."}` (scp + transform; file mode 600).
- [ ] **Step 3: Create `reddit-state.json`** with the seed content above.
- [ ] **Step 4: Insert the `reddit-scan-twiceweekly` scheduled row** (copy-schema-then-insert as noted in Files). Verify: `SELECT id, cron, status FROM scheduled_tasks WHERE id='reddit-scan-twiceweekly'` returns the row, status active.
- [ ] **Step 5: Verify the agent picks it up** — run the fleet's task-list check (per the multi-agent memory recipes) or wait for next scheduled fire; at minimum confirm the row + CLAUDE.md text landed (`grep -c "NEVER post autonomously" CLAUDE.md` → 1).
- [ ] **Step 6: Commit on .153** — the claudeclaw repo is git-tracked: `cd ~/claudeclaw-v2 && git add agents/sales && git commit -m "sales: answers-funnel remit — Reddit draft+approve gate, Monday funnel brief"`.

### Task 7: Umami sanity check

- [ ] **Step 1:** Confirm the events schema is queryable: log in to the Umami API with the credentials and pull last-7-days events for the website id; expect `starter-form-submit`/`consultation-submit` to appear (they already fire today). This validates the Monday-brief recipe in Task 6 before the agent runs it.

### Task 8: Deploy + live verification

- [ ] **Step 1: Final checker + push**

```bash
node scripts/check-answers.mjs        # 12 pages OK
git push                              # Netlify deploys main
```

- [ ] **Step 2: Live checks** (retry up to ~3 min for deploy):

```bash
for s in "" how-much-does-ai-workflow-automation-cost/; do
  curl -s -o /dev/null -w "%{http_code} /answers/$s\n" "https://uptimizeconsulting.ai/answers/$s"
done   # expect 200s
curl -s https://uptimizeconsulting.ai/answers/how-much-does-ai-workflow-automation-cost/ | grep -c "FAQPage"   # ≥1
```

- [ ] **Step 3: Event smoke test** — visit one page in a real browser, click the CTA, confirm `answer-cta-click` appears in Umami's realtime view (Jonathan or Playwright against the live site).
- [ ] **Step 4: Google ping** — if `sitemap.xml` exists in the repo add the 13 URLs; if not, skip (Netlify/organic discovery + internal links suffice; do NOT create a sitemap in this task).

---

## Self-review notes

- Spec coverage: W1→Tasks 1–3+8, W2→Task 4, W3→Task 6, W4→Task 5, W5 unchanged by design (ads launch is its own pre-existing brief), W6→Tasks 6–8. B-path: documentation only (spec), no task — intended.
- The 11 page drafts are content work executed against a fixed template, per-page brief, extraction command, and machine-checked contract; the checker is the test harness for every page.
- Reddit posting is deliberately manual-after-approval; no Reddit API credentials anywhere.
