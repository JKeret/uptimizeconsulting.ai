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
sections.push(readFileSync("docs/marketing/kb-base.md", "utf8").trim());
sections.push(`## 8. The Answers hub — question-by-question knowledge
Generated ${new Date().toISOString().slice(0, 10)} from the live /answers/ pages. When a visitor's question matches one below, answer from it and link the page.`);

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

const out = sections.join("\n\n---\n\n") + "\n";
writeFileSync("docs/marketing/bot-knowledge.md", out);
writeFileSync("docs/marketing/Uptimize_KB_v2.md", out); // the file uploaded to the InstantAIGuru dashboard

// Voice-speakable canon digest for the phone agent (Task: voice intake).
// Deliberately short: a voice prompt carries ~1 page, not the whole KB.
const kbBase = readFileSync("docs/marketing/kb-base.md", "utf8");
const section0 = (kbBase.match(/## 0\.[\s\S]*?(?=\n---)/) ?? [""])[0].trim();
const voiceFaq = `## Five questions callers ask (answers, phone-speakable)

**What does it cost?** Most engagements begin with the one thousand dollar Starter: one painful manual process automated, delivered in about two weeks, fixed price. Bigger multi-process builds run ten to twenty-five thousand plus, and compliance-heavy work runs thirty to seventy-five thousand and up.

**How long does it take?** The Starter takes about two weeks. A typical platform build takes four to eight weeks.

**What should I automate first?** The task that happens most often, follows the same steps every time, and already lives somewhere digital, like a spreadsheet or an inbox.

**Do I need to be technical?** No. Most clients are operators, not engineers. Jonathan translates the technical decisions into business decisions.

**How do we start?** A free thirty minute call with Jonathan. I can take your details right now — Jonathan will call you back within one business day.`;
writeFileSync("docs/marketing/voice-canon.md", `# Voice canon — phone agent digest\n\n${section0}\n\n---\n\n${voiceFaq}\n`);
console.log("Wrote docs/marketing/voice-canon.md");
console.log(`Wrote docs/marketing/bot-knowledge.md + Uptimize_KB_v2.md (${sections.length - 2} answers pages compiled)`);
