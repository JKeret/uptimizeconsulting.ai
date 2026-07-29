# Uptimize Marketing Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and launch the week-1–2 assets of the 90-day marketing plan: copy deck, $1K starter-offer landing page, one-pager (HTML+PDF), homepage proof section, live deploy, and the launch kit (referral notes, Grisha follow-up, ad brief, first AEO article).

**Architecture:** Static additions to the existing single-file Netlify site (`uptimizeconsulting.ai`). A markdown copy deck is the single source of truth for all wording; the landing page and one-pager are new static HTML files reusing the site's existing palette/typography; lead capture uses a new Netlify form. Recurring operations (weekly outreach, ads, articles) get a runbook, not code.

**Tech Stack:** Plain HTML/CSS (site conventions: Montserrat, `--navy:#0F1937 --blue:#1E8CDC --teal:#00C3A5`), Netlify forms + deploy-on-push, headless Chrome for PDF.

## Global Constraints

- Client-facing copy is first-person singular ("I"), per Jonathan's standing preference. Exception: additions to the existing homepage stay outcome-focused/neutral to avoid clashing with its established "we" voice.
- **No em-dashes anywhere in client-facing copy** (pages, one-pager, notes, ads, article).
- Aging Care blurb: anonymized, **NO PHI**, no client name until Plan 9/BAA closes. Say "a home-care agency."
- Ad experiment: $300/month, 60-day cap, kill if no qualified lead by day 30 of spend (verbatim from spec).
- Repo: `~/Development/uptimizeconsulting.ai` — pushing `main` deploys to Netlify. Commit per task; **push only in Task 5 (deploy)**.
- Reuse existing site CSS conventions; do not add build tooling, frameworks, or external JS.

---

### Task 1: Copy deck (single source of truth)

**Files:**
- Create: `docs/marketing/copy.md`

**Interfaces:**
- Produces: canonical copy blocks referenced by Tasks 2, 3, 4, 6, 7, 8. Section anchors: `## Core message`, `## Starter offer`, `## Case blurbs`, `## Referral note template`, `## Grisha follow-up`.

- [ ] **Step 1: Write `docs/marketing/copy.md` with this exact content** (edit wording only if it violates a Global Constraint):

```markdown
# Uptimize Marketing Copy Deck (source of truth)

## Core message

Headline: Your business runs on spreadsheets, texts, and memory. Let's fix that.

Subhead: I build custom apps for small businesses. We start small: one annoying
process, about two weeks, $1,000 fixed price.

Pain lines (pick per audience):
- Billing that takes your whole weekend.
- The same numbers typed into three different systems.
- Paperwork only one person in the company knows how to do.
- "Where is that file?" asked five times a day.

## Starter offer

**The $1,000 Starter Project**
1. Pick the process that wastes the most of your week.
2. We talk for 30 minutes. I map exactly what the app must do.
3. About two weeks later you have working software your team actually uses.

$1,000 fixed price. No hourly billing, no surprises. If it earns its keep,
we talk about what to automate next. Most clients do.

## Case blurbs

**Home care (the $1K-to-$50K arc):** A home-care agency was buried in insurance
paperwork. We started with a $1,000 project: an app that reads claim statements
and flags billing errors automatically. It worked, so we kept going. That first
project grew into a $50,000 platform that now runs their billing compliance end
to end. The fastest way to trust is working software.

**Recruiting:** A recruiting agency needed to screen candidates in four
languages, around the clock. I built a voice assistant that answers calls in
English, Russian, Ukrainian, and Polish, interviews candidates, and files
structured summaries. Recruiters start the day with a ranked list instead of a
full voicemail box.

**Grocery retail:** A fresh market was building its weekly ad flyers by hand.
I built a tablet app that turns product lists into print-ready promotional
graphics. What took days now takes an afternoon.

## Referral note template

Hi [Name], quick favor. I have been building custom apps for small businesses.
[One relevant proof line from the case blurbs.] I am opening a few slots for a
$1,000 Starter Project: I take one annoying manual process and automate it in
about two weeks, fixed price. Who do you know that is drowning in spreadsheets
or paperwork? One intro would mean a lot.
One-pager: https://uptimizeconsulting.ai/starter/uptimize-starter-onepager.pdf
Details: https://uptimizeconsulting.ai/starter/

## Grisha follow-up

Hi Grisha, checking in. The platform is ready for Crystal Way: the Kristina
line, screening in all four languages, and the add-ons we walked through. To
switch it on for your team I need the license set up on your side. Do you have
15 minutes this week? If timing has changed on your end, tell me where things
stand and we will plan around it.
```

- [ ] **Step 2: Verify constraints**

Run: `grep -n "—" docs/marketing/copy.md` → Expected: no matches in copy blocks (headings/notes ok, copy blocks must be clean). Also visually confirm: no client names, no PHI, first-person "I".

- [ ] **Step 3: Commit**

```bash
git add docs/marketing/copy.md
git commit -m "marketing: add copy deck (source of truth)"
```

---

### Task 2: Starter-offer landing page

**Files:**
- Create: `starter/index.html`

**Interfaces:**
- Consumes: copy from `docs/marketing/copy.md` (`Core message`, `Starter offer`, `Case blurbs`).
- Produces: live URL path `/starter/` and Netlify form named `starter-project` (fields: `name`, `email`, `phone`, `business`, `process`). Tasks 3, 4, 6, 7 link to `/starter/`.

- [ ] **Step 1: Build `starter/index.html`**

Single self-contained page (inline CSS, like `index.html`). Copy the `:root` palette, font link, `.btn`, `.container`, and section rhythm from `index.html`. Structure and copy:

1. **Hero** (navy gradient, like homepage hero): Core-message headline + subhead, CTA button `Start with one process →` anchoring to `#start`.
2. **Pain section** (white bg): the four pain lines as a simple list, closing line: "If any of these sound familiar, you do not have a software problem. You have a process problem, and those are fixable."
3. **How it works** (light bg): the three numbered Starter-offer steps as cards.
4. **Proof** (white bg): the three case blurbs as cards, home-care first with a `$1,000 → $50,000` badge.
5. **Offer + form** (`id="start"`, navy bg): price block ("$1,000 fixed price. No hourly billing, no surprises.") and this form:

```html
<form name="starter-project" method="POST" data-netlify="true" netlify-honeypot="bot-field">
  <input type="hidden" name="form-name" value="starter-project">
  <p style="display:none"><label>Don't fill this out: <input name="bot-field"></label></p>
  <input type="text" name="name" placeholder="Your name *" required>
  <input type="email" name="email" placeholder="Email *" required>
  <input type="tel" name="phone" placeholder="Phone (optional)">
  <input type="text" name="business" placeholder="Business name">
  <textarea name="process" placeholder="Describe the process that wastes the most of your week *" required></textarea>
  <button type="submit" class="btn">Claim a starter slot →</button>
</form>
```

6. **Footer**: same as homepage footer, plus link back to `https://uptimizeconsulting.ai`.

Add `<title>The $1,000 Starter Project | Uptimize Consulting</title>` and a meta description using the subhead. All copy first-person "I". No em-dashes.

- [ ] **Step 2: Verify locally**

```bash
cd ~/Development/uptimizeconsulting.ai && python3 -m http.server 8111
```

Open `http://localhost:8111/starter/` in a browser (or headless screenshot at 390px and 1280px widths). Check: renders, no horizontal scroll on mobile width, form fields present, anchor `#start` works. Then `grep -c "—" starter/index.html` → Expected: 0.

- [ ] **Step 3: Commit**

```bash
git add starter/index.html
git commit -m "marketing: add $1K starter-offer landing page"
```

---

### Task 3: One-pager (HTML + PDF)

**Files:**
- Create: `starter/one-pager.html`
- Create: `starter/uptimize-starter-onepager.pdf` (generated)

**Interfaces:**
- Consumes: same copy-deck blocks as Task 2; links to `/starter/`.
- Produces: `https://uptimizeconsulting.ai/starter/uptimize-starter-onepager.pdf` (the URL used in the referral note template).

- [ ] **Step 1: Build `starter/one-pager.html`**

Print-first single Letter page (`@page { size: letter; margin: 0 }`, body sized `8.5in × 11in`, inline CSS, same palette/fonts). Layout top to bottom: logo + "Uptimize Consulting" header strip (navy), Core-message headline, Starter-offer 3 steps (compact row), the three case blurbs (home-care first with the `$1,000 → $50,000` badge), price line, footer with `uptimizeconsulting.ai/starter` + `hello@uptimizeconsulting.ai` + a QR code for `https://uptimizeconsulting.ai/starter/` (generate QR as inline SVG or data-URI PNG via `npx qrcode` locally; no external requests in the page).

- [ ] **Step 2: Generate the PDF**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --print-to-pdf="starter/uptimize-starter-onepager.pdf" --no-pdf-header-footer \
  "file://$HOME/Development/uptimizeconsulting.ai/starter/one-pager.html"
```

- [ ] **Step 3: Verify**

Open the PDF. Expected: exactly 1 page, nothing clipped, QR scans (phone camera or `zbarimg` if installed). `grep -c "—" starter/one-pager.html` → Expected: 0.

- [ ] **Step 4: Commit**

```bash
git add starter/one-pager.html starter/uptimize-starter-onepager.pdf
git commit -m "marketing: add one-pager (HTML + PDF)"
```

---

### Task 4: Homepage proof section + starter link

**Files:**
- Modify: `index.html` (nav `<ul>` ~line 190s; new section inserted before `<!-- CONTACT CTA -->` at line 502; hero CTA area ~line 507 region of hero)

**Interfaces:**
- Consumes: case blurbs from copy deck; `/starter/` from Task 2.
- Produces: homepage section `id="work"`.

- [ ] **Step 1: Add "Recent Work" section**

Insert before the CONTACT CTA section: a `.services`-style section (`id="work"`, light bg) titled "Recent Work" with the three case blurbs as `.card`s (icon + 2–3 sentence blurb + outcome line in teal, e.g. `$1,000 project → $50,000 platform`). Keep wording outcome-focused/neutral (no "I"/"we") so it doesn't clash with the site's existing voice.

- [ ] **Step 2: Add navigation + starter CTA**

- Nav: add `<li><a href="#work">Recent Work</a></li>` before the Contact item.
- Hero: next to the existing CTA buttons add `<a href="/starter/" class="btn btn-outline">$1,000 Starter Project →</a>`.
- End of the new Recent Work section: centered link `See how projects start → /starter/`.

- [ ] **Step 3: Verify locally**

Serve as in Task 2, open `http://localhost:8111/`. Check: new section renders in both desktop and 390px widths, nav link scrolls to it, both starter links navigate to `/starter/`. Confirm the consultation modal and industries accordion still work (regression: click each once).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "marketing: homepage Recent Work section + starter CTAs"
```

---

### Task 5: Deploy + live verification

**Files:** none (push + verify)

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Verify live** (Netlify builds in ~1 min)

```bash
for u in / /starter/ /starter/uptimize-starter-onepager.pdf; do
  curl -s -o /dev/null -w "%{http_code} $u\n" "https://uptimizeconsulting.ai$u"; done
```

Expected: three `200`s.

- [ ] **Step 3: Verify the form is registered**

Submit one test entry on the live `/starter/` form (name "TEST delete me"). Expected: success state, and the submission appears under Netlify → Forms → `starter-project` (new forms are only detected at deploy time, so this catches markup mistakes). Delete the test submission.

---

### Task 6: Launch kit — referral wave + Grisha follow-up

**Files:**
- Create: `docs/marketing/referral-wave.md`

**Interfaces:**
- Consumes: referral note template + Grisha follow-up from copy deck; live URLs from Task 5.

- [ ] **Step 1: Write `docs/marketing/referral-wave.md`**

A worksheet with: (a) the Grisha follow-up message ready to paste; (b) a contact table with columns `Name | Relationship | Proof line to use | Sent | Reply | Next step`, pre-seeded with the known network rows (Ronnie, Ari, Guy, Allan, IFM contact, Eric, past portal clients) plus 10 blank rows for Jonathan to fill; (c) beneath the table, a filled-in example note for Ronnie (home-care proof line) and one for Ari (recruiting/attorney angle, mentioning the mediator/Zoom-screener direction) using the template verbatim.

- [ ] **Step 2: Verify + commit**

Check both example notes: first-person, no em-dashes, links resolve (curl the two URLs). Then:

```bash
git add docs/marketing/referral-wave.md
git commit -m "marketing: referral wave worksheet + Grisha follow-up"
git push origin main
```

- [ ] **Step 3: Hand to Jonathan (human actions this week)**

Jonathan sends: Grisha follow-up today, then 3–5 referral notes/week from the worksheet. Log each contact in Uptimize CRM as they go out (pipeline lives in the CRM per spec).

---

### Task 7: Ad experiment brief (ready for week 4)

**Files:**
- Create: `docs/marketing/ad-experiment.md`

**Interfaces:**
- Consumes: Core message + Starter offer copy; landing URL `/starter/`.

- [ ] **Step 1: Write `docs/marketing/ad-experiment.md`** containing:

- **Budget/guardrails (verbatim from spec):** $300/month total across Facebook + Google ($5/day each), 60-day cap, kill if no qualified lead by day 30 of spend. Qualified lead = form submission describing a real business process.
- **Targeting:** Facebook: 25-mile radius of Naperville IL, ages 30–65, interests small-business ownership/admin tools. Google: same radius, exact/phrase keywords `custom app for small business`, `automate business process`, `small business software developer near me`, negative keywords `free`, `jobs`, `course`, `template`.
- **Destination:** `https://uptimizeconsulting.ai/starter/?utm_source={facebook|google}&utm_medium=cpc&utm_campaign=starter-2026q3`.
- **Three ad variants** (headline + body, built from the pain lines + starter offer, first-person, no em-dashes):
  1. "Billing that takes your whole weekend?" / "I build custom apps for small businesses. One annoying process, about two weeks, $1,000 fixed. See how it works."
  2. "Still typing the same numbers into three systems?" / "A custom app fixes that. $1,000 Starter Project: pick a process, I automate it in about two weeks."
  3. "Your business runs on spreadsheets, texts, and memory." / "Let's fix that. Starter projects from $1,000, fixed price, working software in about two weeks."
- **Setup checklist for Jonathan:** create/verify FB Business + Google Ads accounts, install no pixel beyond default (keep it simple; Netlify form submissions are the conversion signal), start date = week 4 (~2026-08-19), weekly check row (spend, clicks, submissions).

- [ ] **Step 2: Commit + push**

```bash
git add docs/marketing/ad-experiment.md
git commit -m "marketing: ad experiment brief (week-4 ready)"
git push origin main
```

---

### Task 8: AEO article #1 + operations runbook

**Files:**
- Create: `insights/how-much-does-a-custom-app-cost/index.html`
- Modify: `index.html` (footer: add link "Insights")
- Create: `docs/marketing/runbook.md`

**Interfaces:**
- Consumes: site CSS conventions; starter offer copy; `/starter/`.
- Produces: `/insights/how-much-does-a-custom-app-cost/` (first of the weekly AEO series).

- [ ] **Step 1: Write the article page**

Same inline-CSS conventions as `/starter/`, simple readable article layout (720px column). Title: **"How much does a custom app for a small business cost?"** Content (~600 words, first-person, no em-dashes): answer the question directly in the first paragraph (real ranges: $1K starter automation, $10K–25K platform, $1.5K/mo ongoing care), explain what drives cost (integrations, compliance, number of user roles), the anonymized home-care arc as the worked example, close with the starter offer + link to `/starter/`. Add FAQ-style `<h2>` questions ("Can I start small?", "What does $1,000 actually buy?") so answer engines can lift Q/A pairs, plus `FAQPage` JSON-LD for those two questions.

- [ ] **Step 2: Write `docs/marketing/runbook.md`** — the weekly operating rhythm from the spec, as a checklist: Mon outreach block (3–5 referral/outbound touches, log in CRM), one article/week (next 3 queued titles: "Custom software vs. off-the-shelf for a small business", "What processes should a small business automate first?", "How long does it take to build a custom business app?"), weekly pipeline review numbers (conversations, starters sold, conversions), ad check from week 4. Include the 90-day success criteria from the spec verbatim.

- [ ] **Step 3: Verify locally**

Serve and open `/insights/how-much-does-a-custom-app-cost/`; check rendering at both widths, JSON-LD parses (`python3 -c` json.loads on the script block or paste into validator), links to `/starter/` work. `grep -c "—"` on the article → 0.

- [ ] **Step 4: Commit + push, then verify live**

```bash
git add insights/ index.html docs/marketing/runbook.md
git commit -m "marketing: first AEO article + operations runbook"
git push origin main
curl -s -o /dev/null -w "%{http_code}\n" "https://uptimizeconsulting.ai/insights/how-much-does-a-custom-app-cost/"
```

Expected: `200`.
