#!/usr/bin/env node
// Contract checker for /answers/ pages. Run: node scripts/check-answers.mjs
// Checks every answers/*/index.html against the funnel spec's page anatomy.
import { readFileSync, readdirSync, existsSync } from "node:fs";

const errors = [];
const dirs = existsSync("answers")
  ? readdirSync("answers", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
const indexHtml = existsSync("answers/index.html") ? readFileSync("answers/index.html", "utf8") : "";
for (const slug of dirs) {
  const path = `answers/${slug}/index.html`;
  if (!existsSync(path)) { errors.push(`${slug}: missing index.html`); continue; }
  const html = readFileSync(path, "utf8");
  const err = (m) => errors.push(`${slug}: ${m}`);

  if (!html.includes(`<link rel="canonical" href="https://uptimizeconsulting.ai/answers/${slug}/">`)) err("canonical missing or wrong");
  if (!html.includes('data-website-id="a163a740-7152-46d9-9206-1f292ce13579"')) err("Umami script missing");
  if (!html.includes("widget.instantaiguru.com/chat-widget.min.js")) err("chat widget script missing");
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
  if (!indexHtml.includes(`href="/answers/${slug}/"`)) err("not listed on the answers index");
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`${dirs.length} pages OK, all listed on the answers index`);
