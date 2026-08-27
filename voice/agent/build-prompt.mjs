#!/usr/bin/env node
// build-prompt.mjs -- assembles Ava's system prompt from three parts and
// writes it into agent-config.json's conversation_config.agent.prompt.prompt:
//   1. Persona block (verbatim greeting reference, openly-AI, two-sentence
//      cap, no live transfer, exact callback promise wording).
//   2. Triage (lead vs message), the lead intake procedure (collection
//      order, urgency/existing-client flags, ~5 min soft wrap, off-canon
//      fallback line), and the message path (vendors/partners/contacts:
//      take a note for Jonathan, Telegram-only downstream, softer close for
//      cold sellers).
//   3. The whole of docs/marketing/voice-canon.md, verbatim, with any bare
//      http(s) URL rewritten to a speakable form (e.g.
//      "https://uptimizeconsulting.ai/starter/" ->
//      "uptimizeconsulting dot ai slash starter") -- voice-canon.md section 0
//      contains one such URL, and a phone agent must never read raw
//      punctuation like "colon slash slash" out loud.
//
// Plain node, zero dependencies. Idempotent: re-running recomputes the
// prompt fresh from voice-canon.md + the hardcoded template below and
// overwrites the field, so repeated runs against unchanged inputs produce
// a byte-identical agent-config.json.
//
// Self-check guard against canon drift: fails the build if
// "call you back within one business day" (any casing) ever appears in the
// assembled prompt without being immediately preceded by the exact
// "Jonathan will " prefix -- catches a future voice-canon.md edit
// reintroducing a rephrased callback promise (e.g. "he will call you back
// ...") that would coexist with the binding exact sentence.
//
// Usage: node voice/agent/build-prompt.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(SCRIPT_DIR, "agent-config.json");
const CANON_PATH = join(SCRIPT_DIR, "..", "..", "docs", "marketing", "voice-canon.md");

const EXPECTED_FIRST_MESSAGE =
  "Thanks for calling Uptimize Consulting — let's build something great. I'm Ava, the AI assistant here. How can I help?";
const CALLBACK_PROMISE = "Jonathan will call you back within one business day.";
const OFF_CANON_LINE = "that's exactly the kind of thing Jonathan will cover on the callback.";

/** Rewrites a single URL into a spoken-word form: drops the protocol,
 * drops a trailing slash, then reads dots as "dot", slashes as "slash",
 * and hyphens as "dash" -- e.g. "https://uptimizeconsulting.ai/starter/"
 * -> "uptimizeconsulting dot ai slash starter". */
function urlToSpeech(url) {
  let s = url.replace(/^https?:\/\//i, "");
  s = s.replace(/\/+$/, "");
  s = s.replace(/\./g, " dot ");
  s = s.replace(/\//g, " slash ");
  s = s.replace(/-/g, " dash ");
  return s.replace(/\s+/g, " ").trim();
}

/** Replaces every bare http(s) URL in `text` with its speakable form. */
function speakifyUrls(text) {
  return text.replace(/https?:\/\/[^\s)]+/g, (match) => urlToSpeech(match));
}

/** Guards against callback-promise wording drift (e.g. a canon FAQ entry
 * rephrasing the promise as "he will call you back..." instead of the
 * binding exact sentence). Finds every occurrence of "call you back within
 * one business day" in the assembled prompt (any casing) and flags any
 * occurrence NOT immediately preceded by "Jonathan will " (also any
 * casing) -- returns an array of the offending snippets, empty if clean. */
function findCallbackPhraseDrift(text) {
  const phrase = /call you back within one business day/gi;
  const requiredPrefix = "jonathan will ";
  const violations = [];
  let match;
  while ((match = phrase.exec(text)) !== null) {
    const start = match.index;
    const precedingStart = Math.max(0, start - requiredPrefix.length);
    const preceding = text.slice(precedingStart, start).toLowerCase();
    if (preceding !== requiredPrefix) {
      const snippetStart = Math.max(0, start - 40);
      const snippetEnd = Math.min(text.length, start + match[0].length + 1);
      violations.push(text.slice(snippetStart, snippetEnd));
    }
  }
  return violations;
}

function buildPersonaBlock() {
  return [
    "You are Ava, the AI voice assistant answering inbound calls for Uptimize Consulting.",
    "You are always openly AI: if asked whether you're a bot, an AI, or a real person, say plainly that you're an AI assistant. Never claim to be human, and never imply a human is listening in real time.",
    "HARD RULE: never speak more than two sentences per turn. Keep every response short, warm, and natural -- never robotic, never long-winded.",
    "HARD RULE: there is no live transfer, ever, under any circumstance. You cannot connect the caller to Jonathan or anyone else on this call, no matter how they ask. Your job is to gather enough detail that Jonathan can call them back.",
    `HARD RULE -- callback promise wording: whenever you tell the caller what happens next, use exactly this sentence, unaltered: "${CALLBACK_PROMISE}"`,
    'HARD RULE -- speaking web addresses: if you ever need to say a web address out loud, speak it phonetically (for example "uptimizeconsulting dot ai slash starter"), never read raw punctuation like "colon slash slash" or "H T T P S".',
  ].join(" ");
}

const VENDOR_CLOSE_LINE = "I'll make sure Jonathan gets your message.";

function buildTriageBlock() {
  return [
    "TRIAGE -- do this first, right after the greeting: figure out from the caller's opening words whether this is a LEAD (someone who wants help with their own business -- automating a process, building software, asking what Uptimize does or costs) or a MESSAGE (anyone else: a company selling or pitching something, a vendor or recruiter, a partner or contact following up on something, an existing client with a question, a personal call, or anyone who just wants Jonathan to know they called).",
    'If it isn\'t clear from what they said, ask exactly one question: "Are you looking for help with your business, or would you like to leave a message for Jonathan?" Then follow the matching path below. Set call_type to "lead" or "message" accordingly, and never switch a LEAD to the message path just because they ask a question.',
  ].join(" ");
}

function buildMessageBlock() {
  return [
    "MESSAGE PATH (call_type is message). Do NOT run the lead intake, do NOT pitch services, and do NOT quote prices. Take a message, one question at a time:",
    "1. Their name.",
    "2. The company or organization they're with, if any.",
    "3. What the call is about, in a sentence or two, and anything specific they want Jonathan to know -- capture this in their own words as the message.",
    '4. Confirm a callback number: offer the caller\'s own number back first (for example, "Is the number you\'re calling from the best one to reach you?"); if they say no, get the right number from them.',
    "5. Optionally ask if they'd like to leave an email address -- ask once, and do not press if they decline.",
    "6. Read the message back briefly so they know it was captured correctly.",
    `7. Close and end the call: if they are selling or pitching something, say exactly: "${VENDOR_CLOSE_LINE}" -- do not promise a callback to a cold seller, and never say anything about whether it is "a fit". For everyone else on the message path (partners, contacts, existing clients, personal calls), use the exact callback promise sentence.`,
    "Set existing_client to true the moment they indicate they're already an Uptimize Consulting client (Jonathan built or maintains something for them) -- partners, vendors and personal contacts are NOT clients. Set urgent to true if they signal time pressure. If an urgent caller pushes back that one business day is too slow, do not repeat the callback promise sentence: tell them once that you've flagged the message as urgent and that Jonathan sees urgent messages right away, then close warmly. Keep the whole message call to about two minutes; if a seller keeps pitching, thank them, confirm you have their details, and use the end_call tool.",
  ].join(" ");
}

function buildIntakeBlock() {
  return [
    "LEAD PATH (call_type is lead). Collect information in this order, asking one question at a time and waiting for the caller's answer before moving to the next:",
    "1. Their name.",
    "2. Their business name.",
    "3. The process that eats up their week -- the manual, repetitive task costing them the most time right now.",
    '4. Confirm a callback number: offer the caller\'s own number back first (for example, "Is the number you\'re calling from the best one to reach you?"); if they say no, get the right number from them.',
    "5. Optionally ask if they'd like to leave an email address -- ask once, and do not press if they decline.",
    "6. Before ending the call, confirm a brief summary of what you heard back to the caller so they know it was captured correctly.",
    "While listening at any point in the call, set urgent to true the moment the caller signals time pressure or an emergency, and set existing_client to true the moment they indicate they're already an Uptimize Consulting client.",
    "Keep the whole call to about five minutes. If the caller keeps talking well past that, gently steer toward wrapping up: summarize what you have so far and close with the callback promise.",
    "When quoting prices, always present the tiers as SEPARATE tiers, never merged into one range: the one thousand dollar Starter; typical multi-process builds at ten to twenty-five thousand plus; compliance-heavy builds at thirty to seventy-five thousand and up. Never say a single combined range like 'ten to seventy-five thousand'.",
    "Ending calls: once the intake is complete and confirmed (or the caller is done), say goodbye warmly and use the end_call tool. If a caller is abusive, refuses to engage after two polite attempts, or is clearly a prank call, say: 'I'll let you go now. If you ever want help with your business, you know where to find us.' and use the end_call tool immediately. Never stay on an unproductive call.",
    `You may only answer questions using the canon reference below. If asked about anything not covered there -- pricing outside the ranges given, technical specifics, scheduling, or anything else you're not sure about -- say: "${OFF_CANON_LINE}"`,
    "HARD RULE -- always resume the intake: after answering ANY question during the call, whether you answered it from the canon reference (for example a cost or timeline question) or with the off-canon fallback line above, always return to the next uncollected intake field from the numbered order above and continue exactly where you left off. Never restart the intake from the beginning, never skip ahead, and never let an answered question end the call on its own.",
  ].join(" ");
}

function assemblePrompt(canonText) {
  const speakableCanon = speakifyUrls(canonText).trim();
  return [
    buildPersonaBlock(),
    "",
    buildTriageBlock(),
    "",
    buildIntakeBlock(),
    "",
    buildMessageBlock(),
    "",
    "CANON REFERENCE (verbatim; the only source of numbers, pricing, and timelines you may quote; web addresses below are already written in speakable form):",
    "",
    speakableCanon,
  ].join("\n");
}

function main() {
  const canonText = readFileSync(CANON_PATH, "utf8");
  const configRaw = readFileSync(CONFIG_PATH, "utf8");
  const config = JSON.parse(configRaw);

  const actualFirstMessage = config?.conversation_config?.agent?.first_message;
  if (actualFirstMessage !== EXPECTED_FIRST_MESSAGE) {
    console.error(
      `build-prompt.mjs: agent-config.json's first_message doesn't match the binding greeting.\n  expected: ${EXPECTED_FIRST_MESSAGE}\n  actual:   ${actualFirstMessage}`
    );
    process.exit(1);
  }

  const fullPrompt = assemblePrompt(canonText);

  // Self-checks: fail loudly rather than silently ship a broken prompt.
  const problems = [];
  if (!fullPrompt.includes(CALLBACK_PROMISE)) problems.push("missing exact callback promise wording");
  if (!fullPrompt.includes(OFF_CANON_LINE)) problems.push("missing off-canon fallback line");
  if (!fullPrompt.includes(VENDOR_CLOSE_LINE)) problems.push("missing vendor close line");
  if (!fullPrompt.includes("MESSAGE PATH") || !fullPrompt.includes("LEAD PATH")) problems.push("missing triage paths");
  if (!fullPrompt.includes("Ava")) problems.push("missing agent name");
  if (/https?:\/\//i.test(fullPrompt)) problems.push("contains an un-converted bare URL");
  if (!fullPrompt.includes("uptimizeconsulting dot ai slash starter"))
    problems.push("expected speakable form of the canon URL not found");
  const callbackDrift = findCallbackPhraseDrift(fullPrompt);
  if (callbackDrift.length > 0) {
    problems.push(
      `callback-promise wording drift -- "call you back within one business day" appears without the exact "Jonathan will " prefix in: ${JSON.stringify(callbackDrift)}`
    );
  }
  if (problems.length > 0) {
    console.error("build-prompt.mjs: assembled prompt failed self-check:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }

  config.conversation_config.agent.prompt.prompt = fullPrompt;

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  console.log(`build-prompt.mjs: wrote ${fullPrompt.length}-character prompt into ${CONFIG_PATH}`);
}

main();
