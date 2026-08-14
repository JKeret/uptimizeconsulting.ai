#!/usr/bin/env node
// Compiles the /answers/ hub into one knowledge document for the site chat
// bot (InstantAIGuru). The bot's knowledge lives in its SaaS dashboard and is
// static — it does NOT read the site — so every content change here must be
// re-uploaded there. Run this after publishing answers pages, then paste or
// upload docs/marketing/bot-knowledge.md into the InstantAIGuru dashboard.
// Usage: node scripts/build-bot-knowledge.mjs
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ").trim();

const sections = [];
sections.push(`# Uptimize Consulting — site knowledge for the chat bot
Generated ${new Date().toISOString().slice(0, 10)} from the live /answers/ pages. This document is the bot's ONLY source of truth for pricing and timelines.

## Canonical facts (never contradict these)
- Starter project: a flat $1,000, one painful manual process automated, delivered in about two weeks. This is how most engagements begin. Page: https://uptimizeconsulting.ai/starter/
- Typical multi-process platform build: $10,000 to $25,000+, four to eight weeks.
- Compliance-heavy or multi-system builds: $30,000 to $75,000 and up.
- Ongoing care: $300 to $1,500 per month.
- Founder: Jonathan Keret, based in Naperville, IL, working nationwide. Email JKeret@uptimizeconsulting.ai. First call is a free 30-minute discovery call.
- When a visitor asks about cost, timelines, or where to start: answer from the facts above and point them to https://uptimizeconsulting.ai/starter/ or the relevant answers page below.
`);

for (const slug of readdirSync("answers", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const path = `answers/${slug}/index.html`;
  if (!existsSync(path)) continue;
  const html = readFileSync(path, "utf8");
  const h1 = strip((html.match(/<h1>([\s\S]*?)<\/h1>/) ?? [])[1] ?? slug);
  const answer = strip((html.match(/<div class="answer">([\s\S]*?)<\/div>/) ?? [])[1] ?? "");
  const faqs = [];
  for (const block of html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []) {
    try {
      const data = JSON.parse(block.replace(/<script[^>]*>|<\/script>/g, ""));
      if (data["@type"] === "FAQPage") {
        for (const q of data.mainEntity ?? []) faqs.push(`**${q.name}** ${q.acceptedAnswer?.text ?? ""}`);
      }
    } catch {}
  }
  sections.push(`## ${h1}\nPage: https://uptimizeconsulting.ai/answers/${slug}/\n\n${answer}\n\n${faqs.join("\n\n")}`);
}

writeFileSync("docs/marketing/bot-knowledge.md", sections.join("\n\n---\n\n") + "\n");
console.log(`Wrote docs/marketing/bot-knowledge.md (${sections.length - 1} pages compiled)`);
