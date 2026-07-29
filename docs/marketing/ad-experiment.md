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

Conversion signal = Netlify form submissions (check Netlify → Forms →
`starter-project`). No pixel, no extra tracking. Keep it simple.

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
