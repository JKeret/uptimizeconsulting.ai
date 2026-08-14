# Voice intake worker — provisioning record (Task 4)

Every command actually run, in order. Secret **values** are never included below —
only names, ids, and redacted placeholders. Where a step is blocked, that's called
out explicitly with the exact remediation needed.

Worker URL: `https://uptimize-voice-hook.jonathanke.workers.dev`
Account: `d47964e01812b7a90536c6c5b47d1d2b`

## Step 1 — CF Access service token (`uptimize-voice-hook`) — **BLOCKED**

```
CLOUDFLARE_API_TOKEN=$(cat ~/.cloudflare/admin-token) \
CLOUDFLARE_ACCOUNT_ID=d47964e01812b7a90536c6c5b47d1d2b \
curl -X POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/service_tokens" \
  -d '{"name":"uptimize-voice-hook"}'
```

Result: `403 { "errors": [{ "code": 1010, "error": "auth.forbidden" }] }`.

Diagnosis: the admin token at `~/.cloudflare/admin-token` can **read** Access
resources (`GET .../access/apps` and `GET .../access/service_tokens` both
succeeded, 200) but cannot **create** a service token. This is a distinct
Cloudflare permission group ("Access: Service Tokens" — Edit) from "Access:
Apps and Policies" (which this token does have, given the successful reads).

**Remediation** (needs Jonathan, account-owner access): in the Cloudflare
dashboard, My Profile → API Tokens → edit the admin token → add permission
group **Account → Access: Service Tokens → Edit**. Once added, re-run the
`curl` above, then:

```
# capture client_id + client_secret from the response, then immediately:
printf '%s' "<client_secret>" | CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
  npx wrangler secret put CF_ACCESS_CLIENT_SECRET
printf '%s' "<client_id>" | ... npx wrangler secret put CF_ACCESS_CLIENT_ID
```

Alternative: create the service token manually via the CF Zero Trust
dashboard (Access → Service Auth → Create Service Token) and hand the
client_id/secret over for the `wrangler secret put` calls above.

## Step 2 — Access policy on the CRM app — **BLOCKED (depends on Step 1)**

The CRM's Access app was found: `GET /accounts/:acct/access/apps`, filtered
for `domain` containing `crm.uptimizeconsulting.ai` → app id
`ca9b6760-2737-4611-bf5f-4ef366be7e48` ("Uptimize CRM"). It already carries
two policies (both **left untouched**, per instructions):
- `5fb563f9-c11f-4aae-9f98-d3d52790babd` — "Fleet service token" (non_identity,
  a pre-existing, unrelated service token used by the ClaudeClaw fleet)
- `a920d2d9-b24b-48d8-a3fe-0b45c4252fe9` — "Allowed users" (human email allow)

Once Step 1 yields a token id, add a **new**, additive policy:

```
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
curl -X POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/access/apps/ca9b6760-2737-4611-bf5f-4ef366be7e48/policies" \
  -d '{"name":"uptimize-voice-hook service token","decision":"non_identity","include":[{"service_token":{"token_id":"<new-token-id>"}}]}'
```

Not yet attempted live (no token id exists yet to reference) — the endpoint
itself is standard CF API and should work once Step 1 is unblocked.

## Step 3 — CRM service user — DONE

Established path: `apps/api/src/seed/create-service-user.ts` in the CRM repo
(already exists — built for exactly this "dedicated, least-privilege,
separately-audited identity" pattern, previously used for the fleet's own
CRM user). Idempotent, data-level insert only — no migrations run.

```
docker exec \
  -e SERVICE_USER_EMAIL='voice-hook@uptimize.local' \
  -e SERVICE_USER_NAME='Voice Hook' \
  -e SERVICE_USER_ROLE='User' \
  -e SERVICE_USER_PASSWORD='<generated, 28-char>' \
  uptimize-crm-api-1 node_modules/.bin/ts-node -r tsconfig-paths/register \
    src/seed/create-service-user.ts
```

Run on Zima (`casaos@192.168.2.151`, container `uptimize-crm-api-1`).
Role chosen: **User** — the least-privilege system role that can create a
lead (`lead: crud(true,true,true,false)`, scope `own`); `Viewer` cannot
create, `Manager`/`Admin` can also delete/administer, which this identity
doesn't need.

Result: `Created service user: voice-hook@uptimize.local
(6adcbf5f-d34d-4260-812d-31f25e5836c0) role=User`, workspace
`97e25975-ede3-4ce2-b463-a6986c713355` (the same workspace `crm.
uptimizeconsulting.ai` serves — verified via the admin/`jkeret@
uptimizeconsulting.com` row in the same workspace).

Password generated locally (`openssl rand -base64 30 | tr -dc
'A-Za-z0-9' | cut -c1-28`) and piped straight into both the `docker exec`
above and `wrangler secret put CRM_PASSWORD` in the same shell — never
echoed, never written to a file.

## Step 4 — Worker deploy + secrets — DONE (except CF_ACCESS_*, blocked above)

```
cd voice/worker
CLOUDFLARE_API_TOKEN=$(cat ~/.cloudflare/admin-token) \
CLOUDFLARE_ACCOUNT_ID=d47964e01812b7a90536c6c5b47d1d2b \
npx wrangler deploy
```
→ `https://uptimize-voice-hook.jonathanke.workers.dev`

Secrets set (`wrangler secret put <NAME>`, each piped from a shell variable,
never printed):
- `CRM_PASSWORD` — generated locally (see Step 3)
- `CRM_EMAIL` — `voice-hook@uptimize.local`
- `CRM_BASE_URL` — `https://crm.uptimizeconsulting.ai`
- `ELEVENLABS_WEBHOOK_SECRET` — placeholder `pending-elevenlabs-setup`
  (real value arrives in Task 5)
- `TELEGRAM_BOT_TOKEN` — read from `keret@192.168.2.153:
  /Users/keret/claudeclaw-v2/.env` (`TELEGRAM_BOT_TOKEN=`), the same bot
  `notify.sh`/`mc-alerts.mjs` use for main-agent/Mission-Control alerts
- `TELEGRAM_CHAT_ID` — same `.env`, `ALLOWED_CHAT_ID=`
- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` — **not set, PENDING
  Step 1**

Plain vars (`wrangler.toml [vars]`, committed, non-secret):
- `NETLIFY_SITE_URL = "https://uptimizeconsulting.ai"`
- `CRM_LEAD_SOURCE_ID = "649d8b9b-2f0f-4f73-8d7a-769dc2e3e6b9"` (the CRM's
  pre-seeded "Inbound Call" `lead_source` row — reused rather than creating a
  new one, confirmed live via `GET /api/lead-sources`)

## sinks.ts fixes made against the live CRM (in scope per brief)

Live verification (`crmSink`'s login + lead-create calls) surfaced two real
mismatches between the code and the deployed CRM, both fixed:

1. **Route prefix.** The CRM's Nest app mounts controllers at the root
   (`/auth/login`, `/leads`), but the public edge is `uptimize-crm-web-1`
   (nginx), which only proxies the `/api/` location to the API container —
   stripping that prefix before forwarding
   (`location /api/ { proxy_pass http://api:3000/; }`). Everything outside
   `/api/` falls through to the SPA's static `try_files`, which 405s on
   POST. Externally the routes are `/api/auth/login` and `/api/leads`.
   `sinks.ts` now targets those.

2. **Lead payload shape.** `createLeadSchema` on the API is a Zod `.strict()`
   object accepting only `name`, `email`, `phone`, `company`, `sourceId`
   (uuid, optional), `notes` — confirmed live: the old payload's `title` and
   `source` (free-text) keys 400'd with `"Unrecognized key(s) in object:
   'title', 'source'"`. Fixed: `title` folded into the first line of
   `notes` (no title field exists), `business` now maps to `company` (it
   was silently dropped before), `source` string replaced with the optional
   `sourceId` UUID (see `CRM_LEAD_SOURCE_ID` above).

3. **Cookie handling.** The real login response sets **two** `Set-Cookie`
   headers (`crm_session` — the app's own session; `CF_Authorization` —
   Cloudflare Access's own cookie, since the request also crosses Access).
   `headers.get("set-cookie")` collapses multiple Set-Cookie headers into a
   lossy single string; switched to `res.headers.getSetCookie()` and forward
   every cookie. Also dropped the speculative JSON-bearer-token handling —
   the real login response is just `{"ok":true}`, no token, and the CRM's
   `AuthGuard` only ever reads the session cookie (confirmed by reading
   `auth.guard.ts`).

`test/sinks.test.ts` updated to match (mock fetch now supports array-valued
`set-cookie` + `getSetCookie()`); `tsconfig.json`'s `types` bumped to
`@cloudflare/workers-types/latest` (the default subpath's `Headers` type
predates `getSetCookie()`). 36/36 tests pass, `tsc --noEmit` clean.

## Step 5 — Verification

**(a) Garbage POST → 401.**
```
curl -X POST https://uptimize-voice-hook.jonathanke.workers.dev/postcall -d 'garbage'
```
→ `HTTP 401` (missing signature header, rejected before body parsing).

**(b) Service token reaches the CRM through Access.** The worker's own
`CF_ACCESS_CLIENT_ID/SECRET` don't exist yet (Step 1 blocked), so this was
verified using the fleet's **pre-existing, already-authorized** service
token (read from `.153`'s claudeclaw `.env`, used only transiently for this
curl check — never written anywhere, never used as a worker secret):
```
curl -H "CF-Access-Client-Id: <fleet client id>" \
     -H "CF-Access-Client-Secret: <fleet client secret>" \
     https://crm.uptimizeconsulting.ai/
```
→ `HTTP 200`, real app content (not the Access login HTML/redirect).
Confirms the CRM's Access app + tunnel are healthy and a valid service
token reaches it end-to-end. **Re-run this same check once the worker's own
`uptimize-voice-hook` token exists (Step 1).**

Also verified, live, with the fleet token + the new `voice-hook` CRM user's
own credentials, exercising the exact request shapes `crmSink`/`crmLogin`
now send:
- `POST /api/auth/login` → `200 {"ok":true}`, two Set-Cookie headers.
- `POST /api/leads` with the OLD payload shape → `400` (`Unrecognized
  key(s): 'title', 'source'`) — reproduced the bug before fixing it.
- `POST /api/leads` with the FIXED payload shape → `201`, created lead id
  `08b2d63f-dde1-40ef-a403-94fd22fd03bf`, name `"TEST — voice-hook
  provisioning"`. **The `User` role cannot delete leads** (`lead:delete =
  false` by design — least privilege), so per the brief's fallback: this
  id is left for Jonathan to delete manually (Manager/Admin session,
  workspace `97e25975-ede3-4ce2-b463-a6986c713355`) rather than deleting it
  via a direct SQL statement outside the app's own permission model.

**(c) Hand-signed payload → 200 + Telegram delivery.**
```
TS=$(date +%s)
SIG=$(node -e "
  const crypto=require('crypto');
  const body=require('fs').readFileSync('payload.json','utf8');
  const signed = '$TS' + '.' + body;
  console.log(crypto.createHmac('sha256','pending-elevenlabs-setup').update(signed).digest('hex'));
")
curl -X POST https://uptimize-voice-hook.jonathanke.workers.dev/postcall \
  -H "Content-Type: application/json" \
  -H "ElevenLabs-Signature: t=$TS,v0=$SIG" \
  --data-binary @payload.json
```
(`payload.json` is a synthetic ElevenLabs post-call payload shaped for
`parseElevenLabs`, caller name "Provisioning Check".)

→ `HTTP 200` on both attempts. Confirmed via ground-truth DB check (`SELECT
... FROM lead WHERE created_by = '<voice-hook user id>'` → 0 rows) that the
CRM sink correctly did **not** silently succeed without
`CF_ACCESS_CLIENT_ID/SECRET` set — it fails closed (blocked by Access,
`res.ok` false, caught by `deliverLead`'s `Promise.allSettled`). Telegram
delivery confirmed by directly replicating `telegramSink`'s exact call
(same token, same chat id, same `sendMessage` shape) → Telegram API
returned `{"ok":true}` to chat id matching `ALLOWED_CHAT_ID`. Netlify sink
also fired for real (a live form POST to `uptimizeconsulting.ai`'s
`starter-project` Netlify Form, tagged `source=phone-intake`) as a side
effect of the live webhook tests — low-impact, matches real traffic shape.

## Outstanding / PENDING

1. **CF Access service token (`uptimize-voice-hook`) creation is blocked**
   on the admin token's permissions (needs "Access: Service Tokens" Edit
   added — see Step 1). Until then:
   - `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` are unset on the
     worker → the CRM sink will fail closed on every real call (Telegram +
     Netlify still work).
   - The new Access policy for that token (Step 2) can't be added yet.
2. **Test lead** `08b2d63f-dde1-40ef-a403-94fd22fd03bf` ("TEST —
   voice-hook provisioning") exists in the CRM, workspace
   `97e25975-ede3-4ce2-b463-a6986c713355` — the `voice-hook` user's `User`
   role can't delete it; delete manually or leave it (clearly labeled).
3. `ELEVENLABS_WEBHOOK_SECRET` is the placeholder `pending-elevenlabs-setup`
   — Task 5 replaces it with the real ElevenLabs-issued value.
