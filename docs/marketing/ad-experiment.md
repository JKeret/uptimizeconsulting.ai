# Paid Ads Experiment Brief (Tier 4)

Status: ready to launch at week 4 (~2026-08-19). This is an experiment, not a
pillar. Everything below is fixed unless Jonathan changes it deliberately.

## Budget and guardrails (from the spec, verbatim)

- $300/month total across Facebook + Google ($5/day each platform).
- 60-day cap: maximum total spend $600.
- **Kill criterion: no qualified lead by day 30 of spend = stop both platforms.**
- Qualified lead = a `starter-project` form submission describing a real
  business process (not spam, not job seekers).

## Destination

All ads point at the starter landing page with UTM tags:

- Facebook: `https://uptimizeconsulting.ai/starter/?utm_source=facebook&utm_medium=cpc&utm_campaign=starter-2026q3`
- Google: `https://uptimizeconsulting.ai/starter/?utm_source=google&utm_medium=cpc&utm_campaign=starter-2026q3`

Conversion signal = self-hosted Umami analytics
(https://analytics.uptimizeconsulting.ai, runs on Zima): the
`starter-form-submit` event, segmented by `utm_source`. Netlify → Forms →
`starter-project` holds the actual lead details. No Google/Facebook pixel;
ads are judged by Umami event counts per source.

## Targeting

**Facebook**
- Location: 25-mile radius of Naperville, IL
- Age: 30 to 65
- Interests: small business owners, business administration, QuickBooks,
  spreadsheet software
- Placement: Facebook feed + Instagram feed only (no Audience Network)

**Google Search**
- Location: 25-mile radius of Naperville, IL
- Keywords (phrase/exact): "custom app for small business",
  "automate business process", "small business software developer near me"
- Negative keywords: free, jobs, course, template, tutorial

## Ad variants (rotate all three, let the platform optimize)

1. **Headline:** Billing that takes your whole weekend?
   **Body:** I build custom apps for small businesses. One annoying process,
   about two weeks, $1,000 fixed. See how it works.

2. **Headline:** Still typing the same numbers into three systems?
   **Body:** A custom app fixes that. $1,000 Starter Project: pick a process,
   I automate it in about two weeks.

3. **Headline:** Your business runs on spreadsheets, texts, and memory.
   **Body:** Let's fix that. Starter projects from $1,000, fixed price,
   working software in about two weeks.

## Google ad assets (RSA-ready)

The three variants above are Facebook-shaped and exceed Google's limits
(headlines max 30 chars, descriptions max 90). For the Google campaign,
paste these into one Responsive Search Ad and let Google mix them:

**Headlines (≤30 chars each)**
1. `$1,000 Fixed-Price Automation`
2. `Custom Apps for Small Business`
3. `Automated in About Two Weeks`
4. `Stop Retyping Into 3 Systems`
5. `Naperville Software Developer`
6. `Fixed Price. No Surprises.`
7. `Your Weekend Back From Billing`
8. `Free 30-Minute Honest Call`

**Descriptions (≤90 chars each)**
1. `One painful manual process automated for a flat $1,000, delivered in about two weeks.`
2. `I build custom apps for small businesses. Fixed scope, fixed price, working software.`
3. `Running the business on spreadsheets and memory? Pick one process. I automate it.`
4. `Local Naperville developer. Free 30-minute call, honest answer on whether AI helps.`

**Assets (extensions)**
- Sitelinks: `The $1,000 Starter` → /starter/ · `What does it cost?` →
  /answers/how-much-does-ai-workflow-automation-cost/ · `What to automate first` →
  /answers/what-should-a-small-business-automate-first/ · `Answers hub` → /answers/
- Callouts: `$1,000 Fixed Price` · `About Two Weeks` · `No Retainers` · `Senior-Led`
- Location asset: attach once the Google Business Profile is live
  (see local-listings.md) — it upgrades the search ad to a local-feeling one.

**Bidding:** Maximize Clicks with a modest CPC cap. Do NOT enable
conversion-based bidding — by design there is no Google conversion tag
(ads are judged by Umami `starter-form-submit` per utm_source), so Google
has no conversion signal to optimize on.

## Setup checklist (Jonathan)

- [ ] Verify Facebook Business Manager access + payment method
- [ ] Verify Google Ads account + payment method
- [ ] Create 1 campaign per platform with the settings above, $5/day each
- [ ] Paste the three variants into both platforms
- [ ] Start date: week 4 (~2026-08-19)
- [ ] Calendar reminder: weekly check (below) + day-30 kill decision

## Weekly check log

| Week | Platform | Spend | Clicks | Form submissions | Qualified? | Note |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
