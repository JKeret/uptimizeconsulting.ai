# Customer File Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, two-way file-sharing portal at `uptimizeconsulting.ai/portal` where the admin and each customer exchange files, with customers isolated from one another.

**Architecture:** A no-build vanilla-JS single-page app served from the existing Netlify repo under `/portal`, talking directly to Supabase (Auth + private Storage + a `profiles` table) using the logged-in user's JWT. Per-user isolation is enforced by Row-Level Security on `storage.objects` keyed to a folder named after the user id. One Netlify Function (`create-customer`) holds the service-role key and is the only privileged operation (admin-only account creation).

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules, no framework, no bundler), `@supabase/supabase-js` v2 (browser via esm.sh CDN; Node in the function), Netlify Functions (Node), Vitest for unit tests, Netlify CLI for local dev.

---

## File Structure

```
uptimizeconsulting.ai/
├─ index.html                         # existing marketing page (modify: add nav link)
├─ netlify.toml                       # NEW: functions dir + SPA redirect
├─ package.json                       # NEW: deps + test script
├─ netlify/functions/
│  ├─ create-customer.mjs             # NEW: Netlify handler (wires real clients)
│  ├─ create-customer.logic.mjs       # NEW: pure handler logic (dependency-injected, tested)
│  ├─ reset-password.mjs              # NEW: Netlify handler (admin resets a customer pw)
│  └─ reset-password.logic.mjs        # NEW: pure reset logic (tested)
├─ portal/
│  ├─ index.html                      # NEW: SPA shell + module bootstrap
│  ├─ styles.css                      # NEW: brand-matched portal styles
│  ├─ config.js                       # NEW: public Supabase URL + anon key
│  ├─ supabaseClient.js               # NEW: shared browser client
│  ├─ lib.js                          # NEW: pure helpers (tested)
│  ├─ auth.js                         # NEW: login / logout / change password (DOM)
│  ├─ files.js                        # NEW: file list/upload/download/delete for a folder (DOM)
│  ├─ admin.js                        # NEW: customer picker + add customer (DOM)
│  └─ app.js                          # NEW: bootstrap, session, role routing (DOM)
├─ test/
│  ├─ lib.test.mjs                    # NEW: unit tests for portal/lib.js helpers
│  ├─ create-customer.logic.test.mjs  # NEW: unit tests for the function logic
│  └─ reset-password.logic.test.mjs   # NEW: unit tests for the reset logic
└─ docs/superpowers/
   ├─ specs/2026-06-12-customer-file-portal-design.md   # existing
   └─ plans/2026-06-12-customer-file-portal.md          # this file
```

**Responsibilities:**
- `lib.js` and `create-customer.logic.mjs` hold all pure logic — fully unit-tested.
- DOM modules (`auth/files/admin/app`) wire pure logic to the page — verified by the manual E2E matrix in Task 12.
- `config.js` holds only public values (anon key is designed to be public; protected by RLS).

---

## Task 0: Supabase project + database setup (manual, one-time)

This task provisions the backend. It is configuration, not code, so it has setup steps and verification rather than TDD. Do it first; later tasks depend on it.

**Files:**
- Create: `docs/superpowers/setup/supabase-setup.sql` (record the SQL you run, for reproducibility)

- [ ] **Step 1: Create the Supabase project**

In the Supabase dashboard, create a new project (free tier) named `uptimize-portal`. Choose a region near Naperville, IL (e.g. `us-east-1`). Save the project's **Project URL**, **anon public key**, and **service_role key** (Project Settings → API).

- [ ] **Step 2: Disable public signups**

Dashboard → Authentication → Providers → Email → turn **OFF** "Enable sign-ups" (a.k.a. "Allow new users to sign up"). Keep "Confirm email" off (admin creates pre-confirmed users).

- [ ] **Step 3: Create the private bucket**

Dashboard → Storage → New bucket → name `customer-files`, **Public = off**. (Equivalent SQL is in the next step.)

- [ ] **Step 4: Run the schema + policies SQL**

Save this as `docs/superpowers/setup/supabase-setup.sql`, then run it in Dashboard → SQL Editor:

```sql
-- Bucket (no-op if created via UI in Step 3)
insert into storage.buckets (id, name, public)
values ('customer-files', 'customer-files', false)
on conflict (id) do nothing;

-- Profiles: role + customer metadata
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  company      text,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- SECURITY DEFINER avoids recursive RLS when policies call it
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and is_admin
  );
$$;

-- profiles policies
drop policy if exists "read own profile"     on public.profiles;
drop policy if exists "admin read profiles"  on public.profiles;
drop policy if exists "update own profile"   on public.profiles;
create policy "read own profile"    on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admin read profiles" on public.profiles
  for select to authenticated using (public.is_admin());
create policy "update own profile"  on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- storage policies: customers limited to their own {uid}/ folder
drop policy if exists "customer select own" on storage.objects;
drop policy if exists "customer insert own" on storage.objects;
drop policy if exists "customer update own" on storage.objects;
drop policy if exists "customer delete own" on storage.objects;
drop policy if exists "admin all files"     on storage.objects;
create policy "customer select own" on storage.objects for select to authenticated
  using (bucket_id = 'customer-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "customer insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "customer update own" on storage.objects for update to authenticated
  using (bucket_id = 'customer-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "customer delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'customer-files' and (storage.foldername(name))[1] = auth.uid()::text);
-- admin: full access to every folder in the bucket
create policy "admin all files" on storage.objects for all to authenticated
  using (bucket_id = 'customer-files' and public.is_admin())
  with check (bucket_id = 'customer-files' and public.is_admin());
```

- [ ] **Step 5: Create the admin (your) account and flag it**

Dashboard → Authentication → Users → Add user → enter your email + a password, and check "Auto Confirm User". Copy the new user's UID, then run in SQL Editor (replace the UID and email):

```sql
insert into public.profiles (id, email, is_admin, display_name, company)
values ('YOUR-ADMIN-UID', 'you@uptimizeconsulting.ai', true, 'Uptimize Admin', 'Uptimize Consulting AI')
on conflict (id) do update set is_admin = true;
```

- [ ] **Step 6: Verify setup**

In SQL Editor run `select id, email, is_admin from public.profiles;` → Expected: one row, your account, `is_admin = true`. In Storage, confirm `customer-files` exists and is **not** public.

- [ ] **Step 7: Commit the recorded SQL**

```bash
git add docs/superpowers/setup/supabase-setup.sql
git commit -m "chore: record Supabase schema and RLS setup for portal"
```

---

## Task 1: Project scaffolding — package.json, netlify.toml, deps

**Files:**
- Create: `package.json`
- Create: `netlify.toml`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "uptimizeconsulting-ai",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "netlify dev"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create netlify.toml**

```toml
[build]
  publish = "."
  functions = "netlify/functions"

# Serve the SPA shell for any /portal/* path (client-side handles views)
[[redirects]]
  from = "/portal/*"
  to = "/portal/index.html"
  status = 200
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created; `package-lock.json` written; no errors.

- [ ] **Step 4: Verify Vitest runs (no tests yet)**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (acceptable at this stage).

- [ ] **Step 5: Add node_modules to .gitignore and commit**

Create `.gitignore` if absent with:

```
node_modules/
.netlify/
.env
```

```bash
git add package.json package-lock.json netlify.toml .gitignore
git commit -m "chore: scaffold npm + netlify config for portal"
```

---

## Task 2: Pure helpers in `portal/lib.js` (TDD)

These framework-free helpers are unit-tested. `formatBytes` for display, `sanitizeFilename` to keep storage keys clean, `storagePathFor` to build `{uid}/{name}` keys, `isProbablyEmail` for input validation.

**Files:**
- Create: `portal/lib.js`
- Test: `test/lib.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// test/lib.test.mjs
import { describe, it, expect } from 'vitest'
import { formatBytes, sanitizeFilename, storagePathFor, isProbablyEmail } from '../portal/lib.js'

describe('formatBytes', () => {
  it('formats zero and units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
  })
})

describe('sanitizeFilename', () => {
  it('strips path separators and control chars, keeps extension', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('my report (final).pdf')).toBe('my report (final).pdf')
    expect(sanitizeFilename('weird name.exe')).toBe('weirdname.exe')
  })
  it('falls back when name becomes empty', () => {
    expect(sanitizeFilename('/////')).toBe('file')
  })
})

describe('storagePathFor', () => {
  it('joins uid folder and sanitized filename', () => {
    expect(storagePathFor('abc-123', 'a/b/report.pdf')).toBe('abc-123/report.pdf')
  })
})

describe('isProbablyEmail', () => {
  it('accepts valid and rejects invalid', () => {
    expect(isProbablyEmail('a@b.co')).toBe(true)
    expect(isProbablyEmail('nope')).toBe(false)
    expect(isProbablyEmail('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/lib.test.mjs`
Expected: FAIL — cannot resolve module `../portal/lib.js` / exports undefined.

- [ ] **Step 3: Implement the helpers**

```js
// portal/lib.js
export function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++ }
  return `${value.toFixed(1)} ${units[i]}`
}

export function sanitizeFilename(name) {
  const base = String(name).split(/[/\\]/).pop() || ''
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[ -]/g, '').trim()
  return cleaned.length ? cleaned : 'file'
}

export function storagePathFor(userId, filename) {
  return `${userId}/${sanitizeFilename(filename)}`
}

export function isProbablyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/lib.test.mjs`
Expected: PASS, all 4 describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add portal/lib.js test/lib.test.mjs
git commit -m "feat: add tested pure helpers for portal"
```

---

## Task 3: `create-customer` function logic (TDD)

Pure, dependency-injected logic so it can be tested without a live Supabase. It verifies the caller is an admin, generates a password, creates the auth user, inserts the profile, and returns the credentials.

**Files:**
- Create: `netlify/functions/create-customer.logic.mjs`
- Test: `test/create-customer.logic.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// test/create-customer.logic.test.mjs
import { describe, it, expect, vi } from 'vitest'
import { generatePassword, handleCreateCustomer } from '../netlify/functions/create-customer.logic.mjs'

describe('generatePassword', () => {
  it('produces a strong-length password from the byte source', () => {
    const bytes = new Uint8Array(24).fill(7)
    const pw = generatePassword(() => bytes)
    expect(pw).toHaveLength(24)
    expect(/^[A-Za-z0-9]+$/.test(pw)).toBe(true)
  })
})

function deps({ admin = true, createUserError = null, insertError = null } = {}) {
  const createdUser = { id: 'new-uid-1' }
  return {
    getCallerId: vi.fn().mockResolvedValue('caller-uid'),
    isCallerAdmin: vi.fn().mockResolvedValue(admin),
    adminCreateUser: vi.fn().mockResolvedValue(
      createUserError ? { data: null, error: createUserError } : { data: { user: createdUser }, error: null }
    ),
    insertProfile: vi.fn().mockResolvedValue({ error: insertError }),
    randomBytes: () => new Uint8Array(24).fill(1),
  }
}

describe('handleCreateCustomer', () => {
  it('rejects when no auth token', async () => {
    const res = await handleCreateCustomer({ token: '', body: {} }, deps())
    expect(res.status).toBe(401)
  })

  it('rejects a non-admin caller', async () => {
    const res = await handleCreateCustomer(
      { token: 't', body: { email: 'c@x.com', company: 'X' } }, deps({ admin: false }))
    expect(res.status).toBe(403)
  })

  it('rejects an invalid email', async () => {
    const res = await handleCreateCustomer({ token: 't', body: { email: 'bad' } }, deps())
    expect(res.status).toBe(400)
  })

  it('creates the user + profile and returns credentials', async () => {
    const d = deps()
    const res = await handleCreateCustomer(
      { token: 't', body: { email: 'c@x.com', company: 'Acme', displayName: 'Jane' } }, d)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('c@x.com')
    expect(res.body.password).toHaveLength(24)
    expect(d.adminCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'c@x.com', email_confirm: true,
    }))
    expect(d.insertProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: 'new-uid-1', email: 'c@x.com', company: 'Acme', display_name: 'Jane', is_admin: false,
    }))
  })

  it('returns 409 when the user already exists', async () => {
    const d = deps({ createUserError: { message: 'already been registered' } })
    const res = await handleCreateCustomer({ token: 't', body: { email: 'c@x.com' } }, d)
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/create-customer.logic.test.mjs`
Expected: FAIL — module not found / exports undefined.

- [ ] **Step 3: Implement the logic**

```js
// netlify/functions/create-customer.logic.mjs
import { isProbablyEmail } from '../../portal/lib.js'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generatePassword(randomBytes, length = 24) {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

// args:  { token, body: { email, company, displayName } }
// deps:  { getCallerId, isCallerAdmin, adminCreateUser, insertProfile, randomBytes }
export async function handleCreateCustomer({ token, body }, deps) {
  if (!token) return { status: 401, body: { error: 'Not authenticated' } }

  const email = String(body?.email || '').trim().toLowerCase()
  const company = String(body?.company || '').trim()
  const displayName = String(body?.displayName || '').trim()
  if (!isProbablyEmail(email)) return { status: 400, body: { error: 'Valid email required' } }

  const callerId = await deps.getCallerId(token)
  if (!callerId) return { status: 401, body: { error: 'Invalid session' } }
  if (!(await deps.isCallerAdmin(callerId))) return { status: 403, body: { error: 'Admins only' } }

  const password = generatePassword(deps.randomBytes)
  const { data, error } = await deps.adminCreateUser({ email, password, email_confirm: true })
  if (error) {
    const exists = /registered|already/i.test(error.message || '')
    return { status: exists ? 409 : 500, body: { error: error.message || 'Create failed' } }
  }

  const { error: pErr } = await deps.insertProfile({
    id: data.user.id, email, company, display_name: displayName, is_admin: false,
  })
  if (pErr) return { status: 500, body: { error: 'Profile insert failed: ' + pErr.message } }

  return { status: 200, body: { email, password } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/create-customer.logic.test.mjs`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/create-customer.logic.mjs test/create-customer.logic.test.mjs
git commit -m "feat: add tested create-customer function logic"
```

---

## Task 4: `create-customer` Netlify handler (wiring)

Wires real Supabase clients to the tested logic. Verified by local invocation in Task 11/12 (no unit test — it is glue).

**Files:**
- Create: `netlify/functions/create-customer.mjs`

- [ ] **Step 1: Implement the handler**

```js
// netlify/functions/create-customer.mjs
import { createClient } from '@supabase/supabase-js'
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { handleCreateCustomer } from './create-customer.logic.mjs'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let body = {}
  try { body = await req.json() } catch { body = {} }

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

  const deps = {
    getCallerId: async (tok) => {
      const userClient = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${tok}` } } })
      const { data } = await userClient.auth.getUser(tok)
      return data?.user?.id || null
    },
    isCallerAdmin: async (id) => {
      const { data } = await admin.from('profiles').select('is_admin').eq('id', id).single()
      return !!data?.is_admin
    },
    adminCreateUser: (args) => admin.auth.admin.createUser(args),
    insertProfile: (row) => admin.from('profiles').insert(row),
    randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)),
  }

  const res = await handleCreateCustomer({ token, body }, deps)
  return json(res.status, res.body)
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 2: Lint-check imports compile**

Run: `node --check netlify/functions/create-customer.mjs`
Expected: no output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/create-customer.mjs
git commit -m "feat: wire create-customer Netlify handler to logic"
```

---

## Task 5: Browser config + shared Supabase client

**Files:**
- Create: `portal/config.js`
- Create: `portal/supabaseClient.js`

- [ ] **Step 1: Create config.js (public values only)**

Replace the placeholders with your project's **Project URL** and **anon public key** from Task 0 Step 1. These are public by design (RLS protects data); committing them is acceptable.

```js
// portal/config.js
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'
export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY'
```

- [ ] **Step 2: Create the shared client**

```js
// portal/supabaseClient.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

- [ ] **Step 3: Commit**

```bash
git add portal/config.js portal/supabaseClient.js
git commit -m "feat: add portal Supabase browser client + config"
```

---

## Task 6: Portal shell + styles

The SPA shell with three top-level regions toggled by `app.js`: `#login-view`, `#customer-view`, `#admin-view`. Styling matches the marketing site (navy `#0f1b2d`, teal `#2dd4bf`-ish, Montserrat).

**Files:**
- Create: `portal/index.html`
- Create: `portal/styles.css`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Client Portal — Uptimize Consulting AI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="portal-bar">
    <a class="brand" href="/">Uptimize Consulting <span>AI</span></a>
    <div class="bar-right">
      <span id="who" class="who"></span>
      <button id="logout-btn" class="btn ghost" hidden>Log out</button>
    </div>
  </header>

  <main class="portal-main">
    <!-- LOGIN -->
    <section id="login-view" class="card" hidden>
      <h1>Client Portal</h1>
      <p class="muted">Sign in to access your files.</p>
      <form id="login-form">
        <label>Email <input type="email" id="login-email" autocomplete="username" required /></label>
        <label>Password <input type="password" id="login-password" autocomplete="current-password" required /></label>
        <button class="btn" type="submit">Sign in</button>
        <p id="login-error" class="error" role="alert"></p>
      </form>
    </section>

    <!-- CUSTOMER -->
    <section id="customer-view" hidden>
      <div class="row-between">
        <h1>Your Files</h1>
        <button id="cust-change-pw" class="btn ghost">Change password</button>
      </div>
      <div id="customer-files"></div>
    </section>

    <!-- ADMIN -->
    <section id="admin-view" hidden>
      <div class="row-between">
        <h1>Admin — Customer Files</h1>
        <div class="file-actions">
          <button id="admin-reset-pw" class="btn ghost">Reset password</button>
          <button id="admin-add-customer" class="btn">+ Add customer</button>
        </div>
      </div>
      <label class="picker">Customer
        <select id="admin-customer-select"></select>
      </label>
      <div id="admin-files"></div>
    </section>
  </main>

  <div id="loading" class="loading">Loading…</div>
  <script type="module" src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create styles.css**

```css
:root{--navy:#0f1b2d;--navy2:#15253c;--teal:#2dd4bf;--ink:#e8eef6;--muted:#9fb1c7;--line:#26384f;--err:#ff6b6b;}
*{box-sizing:border-box}
body{margin:0;font-family:Montserrat,system-ui,sans-serif;background:var(--navy);color:var(--ink)}
.portal-bar{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;border-bottom:1px solid var(--line);background:var(--navy2)}
.brand{color:var(--ink);text-decoration:none;font-weight:800}
.brand span{color:var(--teal)}
.bar-right{display:flex;align-items:center;gap:12px}
.who{color:var(--muted);font-size:.85rem}
.portal-main{max-width:860px;margin:0 auto;padding:28px 20px}
.card{max-width:420px;margin:6vh auto;background:var(--navy2);border:1px solid var(--line);border-radius:14px;padding:28px}
h1{font-size:1.4rem;margin:0 0 6px}
.muted{color:var(--muted)}
form{display:flex;flex-direction:column;gap:14px;margin-top:14px}
label{display:flex;flex-direction:column;gap:6px;font-size:.85rem;color:var(--muted)}
input,select{padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--navy);color:var(--ink);font:inherit}
.btn{background:var(--teal);color:var(--navy);border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font:inherit}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.row-between{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.picker{display:flex;flex-direction:column;gap:6px;max-width:360px;margin-bottom:18px}
.error{color:var(--err);font-size:.85rem;min-height:1em}
.loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--navy);color:var(--muted)}
.file-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:var(--navy2)}
.file-meta{display:flex;flex-direction:column}
.file-name{font-weight:600}
.file-sub{color:var(--muted);font-size:.78rem}
.file-actions{display:flex;gap:8px}
.dropzone{border:2px dashed var(--line);border-radius:12px;padding:22px;text-align:center;color:var(--muted);margin-bottom:18px}
.dropzone.drag{border-color:var(--teal);color:var(--ink)}
.empty{color:var(--muted);padding:18px;text-align:center}
.cred-box{background:var(--navy);border:1px solid var(--teal);border-radius:10px;padding:14px;margin-top:12px;font-family:monospace;word-break:break-all}
```

- [ ] **Step 3: Commit**

```bash
git add portal/index.html portal/styles.css
git commit -m "feat: add portal shell and brand-matched styles"
```

---

## Task 7: Auth module — login, logout, change password

**Files:**
- Create: `portal/auth.js`

- [ ] **Step 1: Implement auth.js**

```js
// portal/auth.js
import { supabase } from './supabaseClient.js'

export function wireLogin(onSuccess) {
  const form = document.getElementById('login-form')
  const errEl = document.getElementById('login-error')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errEl.textContent = ''
    const email = document.getElementById('login-email').value.trim()
    const password = document.getElementById('login-password').value
    const btn = form.querySelector('button')
    btn.disabled = true
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    btn.disabled = false
    if (error) { errEl.textContent = 'Incorrect email or password.'; return }
    onSuccess()
  })
}

export function wireLogout() {
  const btn = document.getElementById('logout-btn')
  btn.addEventListener('click', async () => {
    await supabase.auth.signOut()
    location.reload()
  })
}

export function wireChangePassword(buttonId) {
  const btn = document.getElementById(buttonId)
  if (!btn) return
  btn.addEventListener('click', async () => {
    const pw = prompt('Enter a new password (min 8 characters):')
    if (!pw) return
    if (pw.length < 8) { alert('Password must be at least 8 characters.'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    alert(error ? 'Could not update password: ' + error.message : 'Password updated.')
  })
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check portal/auth.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add portal/auth.js
git commit -m "feat: add portal auth (login/logout/change password)"
```

---

## Task 8: Files module — list/upload/download/delete for a folder

Renders a file list and a dropzone for a given storage folder (`userId`). Reused by both customer and admin views. `canDelete` gates the delete button.

**Files:**
- Create: `portal/files.js`

- [ ] **Step 1: Implement files.js**

```js
// portal/files.js
import { supabase } from './supabaseClient.js'
import { formatBytes, storagePathFor } from './lib.js'

const BUCKET = 'customer-files'

export async function renderFiles(containerId, userId, opts = {}) {
  const container = document.getElementById(containerId)
  container.innerHTML = ''
  container.appendChild(buildDropzone(userId, () => renderFiles(containerId, userId, opts)))

  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    limit: 200, sortBy: { column: 'name', order: 'asc' },
  })
  if (error) { container.appendChild(msg('Could not load files: ' + error.message)); return }

  const files = (data || []).filter((f) => f.id !== null) // drop folder placeholders
  if (!files.length) { container.appendChild(msg('No files yet.', 'empty')); return }

  for (const f of files) {
    container.appendChild(fileRow(userId, f, opts, () => renderFiles(containerId, userId, opts)))
  }
}

function fileRow(userId, f, opts, refresh) {
  const row = document.createElement('div')
  row.className = 'file-row'
  const meta = document.createElement('div')
  meta.className = 'file-meta'
  meta.innerHTML = `<span class="file-name"></span><span class="file-sub"></span>`
  meta.querySelector('.file-name').textContent = f.name
  meta.querySelector('.file-sub').textContent = formatBytes(f.metadata?.size || 0)
  row.appendChild(meta)

  const actions = document.createElement('div')
  actions.className = 'file-actions'

  const dl = document.createElement('button')
  dl.className = 'btn ghost'; dl.textContent = 'Download'
  dl.addEventListener('click', () => downloadFile(`${userId}/${f.name}`))
  actions.appendChild(dl)

  if (opts.canDelete) {
    const del = document.createElement('button')
    del.className = 'btn ghost'; del.textContent = 'Delete'
    del.addEventListener('click', async () => {
      if (!confirm(`Delete "${f.name}"?`)) return
      const { error } = await supabase.storage.from(BUCKET).remove([`${userId}/${f.name}`])
      if (error) alert('Delete failed: ' + error.message)
      refresh()
    })
    actions.appendChild(del)
  }
  row.appendChild(actions)
  return row
}

async function downloadFile(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60, { download: true })
  if (error) { alert('Download failed: ' + error.message); return }
  window.open(data.signedUrl, '_blank')
}

function buildDropzone(userId, refresh) {
  const dz = document.createElement('div')
  dz.className = 'dropzone'
  dz.innerHTML = `<p>Drag files here or <label class="link"><u>browse</u><input type="file" multiple hidden></label></p>`
  const input = dz.querySelector('input')
  input.addEventListener('change', () => uploadAll([...input.files], userId, refresh))
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag') })
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'))
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('drag')
    uploadAll([...e.dataTransfer.files], userId, refresh)
  })
  return dz
}

async function uploadAll(files, userId, refresh) {
  const MAX = 100 * 1024 * 1024 // 100 MB guard
  for (const file of files) {
    if (file.size > MAX) { alert(`"${file.name}" exceeds 100 MB and was skipped.`); continue }
    const path = storagePathFor(userId, file.name)
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
    if (error) { alert(`Upload of "${file.name}" failed: ` + error.message) }
  }
  refresh()
}

function msg(text, cls = 'empty') {
  const p = document.createElement('p'); p.className = cls; p.textContent = text; return p
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check portal/files.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add portal/files.js
git commit -m "feat: add portal file list/upload/download/delete module"
```

---

## Task 9: Admin module — customer picker + add customer

**Files:**
- Create: `portal/admin.js`

- [ ] **Step 1: Implement admin.js**

```js
// portal/admin.js
import { supabase } from './supabaseClient.js'
import { renderFiles } from './files.js'
import { isProbablyEmail } from './lib.js'

export async function initAdmin() {
  const select = document.getElementById('admin-customer-select')
  await loadCustomers(select)
  select.addEventListener('change', () => showSelected(select))
  document.getElementById('admin-add-customer').addEventListener('click', () => addCustomer(select))
  document.getElementById('admin-reset-pw').addEventListener('click', () => resetPassword(select))
  showSelected(select)
}

async function resetPassword(select) {
  const userId = select.value
  if (!userId) { alert('Select a customer first.'); return }
  const label = select.options[select.selectedIndex].textContent
  if (!confirm(`Reset the password for ${label}?`)) return

  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/.netlify/functions/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ userId }),
  })
  const result = await resp.json()
  if (!resp.ok) { alert('Could not reset password: ' + (result.error || resp.status)); return }
  showCredentials(select.options[select.selectedIndex].dataset.email || label, result.password)
}

async function loadCustomers(select) {
  const { data, error } = await supabase
    .from('profiles').select('id, email, company, display_name')
    .eq('is_admin', false).order('company', { ascending: true })
  select.innerHTML = ''
  if (error) { alert('Could not load customers: ' + error.message); return }
  if (!data?.length) { select.innerHTML = '<option value="">No customers yet</option>'; return }
  for (const c of data) {
    const o = document.createElement('option')
    o.value = c.id
    o.dataset.email = c.email || ''
    o.textContent = c.company ? `${c.company} — ${c.email}` : c.email
    select.appendChild(o)
  }
}

function showSelected(select) {
  const id = select.value
  if (!id) { document.getElementById('admin-files').innerHTML = '<p class="empty">Add a customer to begin.</p>'; return }
  renderFiles('admin-files', id, { canDelete: true })
}

async function addCustomer(select) {
  const email = prompt('Customer email:')
  if (!email) return
  if (!isProbablyEmail(email)) { alert('Please enter a valid email.'); return }
  const company = prompt('Company name (optional):') || ''
  const displayName = prompt('Contact name (optional):') || ''

  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/.netlify/functions/create-customer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ email, company, displayName }),
  })
  const result = await resp.json()
  if (!resp.ok) { alert('Could not create customer: ' + (result.error || resp.status)); return }

  showCredentials(result.email, result.password)
  await loadCustomers(select)
}

function showCredentials(email, password) {
  const box = document.createElement('div')
  box.className = 'cred-box'
  box.innerHTML = `<strong>Send these to the customer:</strong><br>Email: ${email}<br>Password: ${password}`
  const view = document.getElementById('admin-view')
  view.insertBefore(box, view.querySelector('.picker'))
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check portal/admin.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add portal/admin.js
git commit -m "feat: add portal admin module (customer picker + add customer)"
```

---

## Task 9b: `reset-password` function (TDD + wiring)

Lets the admin reset a customer's password (e.g. they lost it). Same admin-guard shape as `create-customer`; generates a fresh password and sets it via the admin API.

**Files:**
- Create: `netlify/functions/reset-password.logic.mjs`
- Create: `netlify/functions/reset-password.mjs`
- Test: `test/reset-password.logic.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// test/reset-password.logic.test.mjs
import { describe, it, expect, vi } from 'vitest'
import { handleResetPassword } from '../netlify/functions/reset-password.logic.mjs'

function deps({ admin = true, updateError = null } = {}) {
  return {
    getCallerId: vi.fn().mockResolvedValue('caller-uid'),
    isCallerAdmin: vi.fn().mockResolvedValue(admin),
    updateUserPassword: vi.fn().mockResolvedValue({ error: updateError }),
    randomBytes: () => new Uint8Array(24).fill(1),
  }
}

describe('handleResetPassword', () => {
  it('rejects when no token', async () => {
    const res = await handleResetPassword({ token: '', body: { userId: 'u1' } }, deps())
    expect(res.status).toBe(401)
  })
  it('rejects a non-admin', async () => {
    const res = await handleResetPassword({ token: 't', body: { userId: 'u1' } }, deps({ admin: false }))
    expect(res.status).toBe(403)
  })
  it('rejects missing userId', async () => {
    const res = await handleResetPassword({ token: 't', body: {} }, deps())
    expect(res.status).toBe(400)
  })
  it('resets and returns a new password', async () => {
    const d = deps()
    const res = await handleResetPassword({ token: 't', body: { userId: 'u1' } }, d)
    expect(res.status).toBe(200)
    expect(res.body.password).toHaveLength(24)
    expect(d.updateUserPassword).toHaveBeenCalledWith('u1', expect.any(String))
  })
  it('returns 500 when the update fails', async () => {
    const d = deps({ updateError: { message: 'nope' } })
    const res = await handleResetPassword({ token: 't', body: { userId: 'u1' } }, d)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/reset-password.logic.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the logic**

```js
// netlify/functions/reset-password.logic.mjs
import { generatePassword } from './create-customer.logic.mjs'

// args: { token, body: { userId } }
// deps: { getCallerId, isCallerAdmin, updateUserPassword, randomBytes }
export async function handleResetPassword({ token, body }, deps) {
  if (!token) return { status: 401, body: { error: 'Not authenticated' } }
  const userId = String(body?.userId || '').trim()
  if (!userId) return { status: 400, body: { error: 'userId required' } }

  const callerId = await deps.getCallerId(token)
  if (!callerId) return { status: 401, body: { error: 'Invalid session' } }
  if (!(await deps.isCallerAdmin(callerId))) return { status: 403, body: { error: 'Admins only' } }

  const password = generatePassword(deps.randomBytes)
  const { error } = await deps.updateUserPassword(userId, password)
  if (error) return { status: 500, body: { error: error.message || 'Reset failed' } }
  return { status: 200, body: { password } }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/reset-password.logic.test.mjs`
Expected: PASS — all cases green.

- [ ] **Step 5: Implement the handler**

```js
// netlify/functions/reset-password.mjs
import { createClient } from '@supabase/supabase-js'
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { handleResetPassword } from './reset-password.logic.mjs'

const URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  let body = {}
  try { body = await req.json() } catch { body = {} }

  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const deps = {
    getCallerId: async (tok) => {
      const userClient = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${tok}` } } })
      const { data } = await userClient.auth.getUser(tok)
      return data?.user?.id || null
    },
    isCallerAdmin: async (id) => {
      const { data } = await admin.from('profiles').select('is_admin').eq('id', id).single()
      return !!data?.is_admin
    },
    updateUserPassword: async (userId, password) => {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      return { error }
    },
    randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)),
  }

  const res = await handleResetPassword({ token, body }, deps)
  return json(res.status, res.body)
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 6: Syntax check + run full suite**

Run: `node --check netlify/functions/reset-password.mjs && npx vitest run`
Expected: no syntax output; all unit tests PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/reset-password.logic.mjs netlify/functions/reset-password.mjs test/reset-password.logic.test.mjs
git commit -m "feat: add admin reset-password function"
```

---

## Task 10: App bootstrap — session + role routing

Ties it together: on load, check session; if none, show login; if a session exists, read the user's role and show the customer or admin view.

**Files:**
- Create: `portal/app.js`

- [ ] **Step 1: Implement app.js**

```js
// portal/app.js
import { supabase } from './supabaseClient.js'
import { wireLogin, wireLogout, wireChangePassword } from './auth.js'
import { renderFiles } from './files.js'
import { initAdmin } from './admin.js'

const views = {
  loading: document.getElementById('loading'),
  login: document.getElementById('login-view'),
  customer: document.getElementById('customer-view'),
  admin: document.getElementById('admin-view'),
}

function show(name) {
  views.loading.hidden = name !== 'loading'
  views.login.hidden = name !== 'login'
  views.customer.hidden = name !== 'customer'
  views.admin.hidden = name !== 'admin'
  document.getElementById('logout-btn').hidden = (name === 'login' || name === 'loading')
}

async function route() {
  show('loading')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { show('login'); return }

  const { data: profile, error } = await supabase
    .from('profiles').select('is_admin, email, display_name').eq('id', session.user.id).single()
  if (error || !profile) {
    document.getElementById('who').textContent = session.user.email
    show('customer')
    renderFiles('customer-files', session.user.id, { canDelete: true })
    return
  }

  document.getElementById('who').textContent = profile.display_name || profile.email || session.user.email
  if (profile.is_admin) { show('admin'); await initAdmin() }
  else { show('customer'); renderFiles('customer-files', session.user.id, { canDelete: true }) }
}

wireLogin(route)
wireLogout()
wireChangePassword('cust-change-pw')
route()
```

- [ ] **Step 2: Syntax check**

Run: `node --check portal/app.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add portal/app.js
git commit -m "feat: add portal bootstrap with session + role routing"
```

---

## Task 11: Add portal link to the marketing site

**Files:**
- Modify: `index.html` (nav)

- [ ] **Step 1: Add a "Client Login" link to the nav**

Find the nav links list in `index.html` (the `<nav>` containing `Services`, `Results`, etc.). Add this item just before the "Book a Call" CTA:

```html
<a href="/portal/">Client Login</a>
```

(Match the surrounding markup/classes of the existing nav `<a>` items exactly.)

- [ ] **Step 2: Verify locally**

Run: `npx netlify dev`
Open `http://localhost:8888/` → the nav shows "Client Login" → clicking it loads the portal login at `/portal/`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: link Client Login from marketing nav to portal"
```

---

## Task 12: End-to-end verification (manual matrix)

Run the full system locally with the Netlify CLI against the real Supabase project, then confirm isolation.

**Files:** none (verification only)

- [ ] **Step 1: Set local function env vars**

Create `.env` (already gitignored) with:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
```

- [ ] **Step 2: Start the dev server**

Run: `npx netlify dev`
Expected: site on `http://localhost:8888`, functions on `/.netlify/functions/*`.

- [ ] **Step 3: Run the matrix and tick each**

  - [ ] Admin login → admin view shows, "Add customer" present.
  - [ ] Add customer "A" → a credentials box appears with email + 24-char password; A appears in the picker.
  - [ ] Add customer "B" the same way.
  - [ ] As admin, select A → upload `test.pdf` → it lists with a size.
  - [ ] Log out → log in as A (using shown password) → see only `test.pdf`; no customer picker.
  - [ ] As A, upload `from-customer.png` → log in as admin, select A → both files visible.
  - [ ] Log in as B → folder is empty ("No files yet"); B cannot see A's files.
  - [ ] **Isolation probe:** while logged in as B, in the browser console run:
        `await (await import('/portal/supabaseClient.js')).supabase.storage.from('customer-files').list('A-USER-ID')`
        Expected: empty array (RLS blocks listing A's folder). Replace `A-USER-ID` with A's uid from the admin picker `<option value>`.
  - [ ] Customer "Change password" → set new password → log out → log in with new password succeeds.
  - [ ] As admin, select A → "Reset password" → confirm → a credentials box shows a new 24-char password; logging in as A with the new password succeeds.
  - [ ] Wrong password on login → "Incorrect email or password." shown.

- [ ] **Step 4: Run the unit suite once more**

Run: `npx vitest run`
Expected: all tests from Tasks 2 and 3 PASS.

- [ ] **Step 5: Commit any fixes discovered during verification**

```bash
git add -A
git commit -m "fix: address issues found during portal E2E verification"
```

---

## Task 13: Deploy

**Files:** none

- [ ] **Step 1: Set production env vars in Netlify**

In the Netlify site dashboard → Site configuration → Environment variables, add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (same values as `.env`). Mark the service-role key as a secret.

- [ ] **Step 2: Merge the feature branch and push**

```bash
git checkout main
git merge --no-ff feat/customer-file-portal
git push origin main
```

- [ ] **Step 3: Verify the production deploy**

After Netlify finishes building, open `https://uptimizeconsulting.ai/portal/` → log in as admin → confirm the admin view and `create-customer` work in production (add a throwaway test customer, then delete it from the Supabase dashboard).

---

## Notes for the implementer

- **Service-role key never reaches the browser.** It lives only in Netlify env / `.env` and is used solely by `create-customer.mjs`.
- **The anon key in `config.js` is public by design** — RLS is the security boundary, which is why the Task 12 isolation probe matters.
- **`.exe` files** are stored and downloaded as opaque blobs via signed URLs; they are never served as public links or executed.
- **DOM modules are intentionally not unit-tested** (no bundler/jsdom in this no-build setup). Their correctness is covered by the Task 12 matrix. Pure logic lives in `lib.js` and `create-customer.logic.mjs`, which are unit-tested.
