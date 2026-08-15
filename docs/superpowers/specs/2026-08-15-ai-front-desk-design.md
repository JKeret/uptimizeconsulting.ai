# AI Front Desk — product page design

Date: 2026-08-15. Status: approved direction. Adds Uptimize's first productized
resale offer to the site: an AI customer-service agent ("AI Front Desk"),
delivered by Jonathan as a setup service on top of instantAIguru's platform
(Ron Pinkas), with Jonathan's own Ava as the live demo.

## Decisions (Jonathan, 2026-08-15)

1. **Model: setup service + direct subscription.** Customer pays Uptimize a
   $1,000 setup; the platform subscription is theirs, billed directly by
   instantAIguru. Jonathan earns setup fee + referral commission.
2. **Commission is informal today.** Page ships without depending on the
   numbers, but Jonathan pins terms with Ron BEFORE launch: percentage,
   attribution mechanism, and written-enough OK to use the instantAIguru name
   on the page. (Gate: the page can be built now, but the push-to-main deploy
   waits on Ron's OK.)
3. **Pricing display:** setup price explicit ($1,000, "about two weeks" —
   canon); platform as "from $95/month, billed directly by instantAIguru;
   exact plan confirmed on your free call." Uptimize never quotes Ron's
   discounts.
4. **Name: "AI Front Desk."** Outcome language; covers web chat + WhatsApp +
   phone in one metaphor.

## The offer (canonical copy facts)

- AI Front Desk = an AI assistant answering the customer's business 24/7 on
  website chat and WhatsApp (and phone, where wanted), trained on their own
  business content, openly AI, escalating to the owner with summaries.
- Setup ($1,000, about two weeks, fixed price) includes: knowledge base built
  from their site/documents/interview; assistant persona, name, and greeting;
  website widget install; WhatsApp Business connection; canon pricing/FAQ
  tuning; test-conversation scripts run and passed; handoff walkthrough.
- Platform subscription: from $95/month, paid by the customer directly to
  instantAIguru. Uptimize does not resell, bill, or mark up the platform.
- Ongoing help beyond setup: standard care plans ($300 to $1,500/month) cover
  it, consistent with existing canon. No new retainer tier invented.
- Disclosure line on the page: "Uptimize Consulting is an instantAIguru
  partner." (Also satisfies FTC affiliate-disclosure hygiene.)

## The page — `/ai-front-desk/`

Built on the /starter/ page pattern (same CSS variables, Montserrat, nav,
Umami snippet, Netlify form mechanics). Sections in order:

1. **Hero:** "Your business, answered 24/7." Sub: chat, WhatsApp, and phone,
   handled by an AI front desk trained on your business — for the price of
   one slow Saturday. CTA button → form.
2. **"You're talking to one right now" (the demo block):** Ava's avatar +
   three actions: *Chat with Ava* (opens the site widget via the widget's JS
   API if available, else instruction to click the bubble), *WhatsApp her*
   (https://wa.me/16304451958), *Call her* ((630) 445-1958 — this button ships
   HIDDEN behind an HTML comment until the port completes; enabling it is a
   one-line uncomment noted in the runbook).
3. **What you get in setup** (the bullet list above, in "I" voice).
4. **Pricing cards:** Setup $1,000 one-time (about two weeks) · Platform from
   $95/month billed by instantAIguru · Optional care plan $300–$1,500/month.
5. **Who it's for:** restaurants, stores, clinics, service businesses — any
   owner whose phone rings while their hands are full. Honest "who it's NOT
   for": businesses with no inbound customer questions.
6. **FAQ** (with FAQPage JSON-LD): what does it cost; how long; do I need to
   be technical; what happens when it can't answer (escalation + summaries);
   is it openly an AI (yes — and why that builds trust); can it answer the
   phone too.
7. **Form:** the existing Netlify `starter-project` form markup with hidden
   `source=ai-front-desk`; fields unchanged (name, email, phone, business,
   process → placeholder text adapted: "What do customers ask you all day?").
8. **Disclosure + footer** per site pattern.

Copy rules (binding, as everywhere): first-person "I" voice; no em-dashes;
no client names; canon numbers only (the $95/month from-price is hereby part
of canon for this offer); "about two weeks" is the only setup duration.

## Measurement

- Umami: auto pageviews; `frontdesk-cta-click` on hero + pricing CTAs
  (`data-umami-event-slug="ai-front-desk"`); form submits ride the existing
  `starter-form-submit` event, distinguished by `source=ai-front-desk` in
  Netlify.
- Sales agent 9am check and Monday brief pick the leads up with zero changes
  (source field already reported since the voice-intake work).

## Cross-links (nav unchanged — it is at capacity)

- Homepage services grid: one new card "AI Front Desk" → /ai-front-desk/.
- `/answers/ai-chatbots-for-small-business-customer-support/`: CTA block gains
  a second line linking the product page ("Want one without building it
  yourself? See the AI Front Desk.").
- Footer: link beside Answers/Insights.
- /starter/ is NOT modified: the Starter stays a pure single-process wedge.

## Canon / KB / Ava integration

- `docs/marketing/kb-base.md`: new section-5 Q&As — "Can you set up an AI
  chatbot / front desk for my business?" updated to name the productized
  offer, its $1,000 setup + from-$95/month shape, and "you're talking to the
  demo right now."
- Voice canon: the five-question digest is NOT expanded (phone stays
  intake-first); phone-Ava's canon reference gains one sentence via kb-base
  section 0 only if asked — no new prompt block.
- Regenerate via `build-bot-knowledge.mjs`; Jonathan re-uploads Uptimize_KB_v2
  to the Guru dashboard (his dashboard step, listed at launch).

## Launch gates

1. Ron: commission %, attribution method, name-use OK (Jonathan, one
   message). Page merges to a branch freely; production deploy waits on this.
2. KB re-upload after regeneration (Jonathan dashboard step).
3. Phone button stays hidden until the 630 port completes.

## Out of scope

White-label/resell billing; a separate demo tenant on instantAIguru;
commission tracking automation; changes to /starter/, the nav, or the ads
experiment (its kill criterion and destination stay untouched); Yelp/GBP
service-list updates (worth adding "AI front desk setup" to both listings
later — noted for the runbook, not this build).

## Success criteria

- /ai-front-desk/ live with working demo buttons (chat + WhatsApp at launch,
  phone post-port), FAQ schema valid, form submitting with the right source.
- First AI Front Desk lead distinguishable in Netlify/Monday brief.
- Ava (site + WhatsApp) answers "can I get one of these?" with the offer and
  page link, verified by a live chat test after KB re-upload.
