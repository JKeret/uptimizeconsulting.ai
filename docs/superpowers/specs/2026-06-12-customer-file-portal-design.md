# Customer File Portal — Design Spec

**Date:** 2026-06-12
**Project:** uptimizeconsulting.ai
**Status:** Approved design, pending implementation plan

## Purpose

Add a private file-sharing portal to the Uptimize Consulting AI website so the
owner (admin) can exchange files with customers. The owner uploads deliverables
for customers to download, and customers can upload files back. Each customer
has an isolated, login-protected space; customers cannot see each other's files.

## Requirements (confirmed)

- **Sensitivity:** Customer files, standard security. Private behind login. No
  regulated/compliance overhead (no HIPAA-grade controls).
- **Direction:** Two-way. Admin uploads for customers; customers upload back.
- **Scale:** Small. A handful of customers; files are mostly PDFs and images,
  plus occasional `.exe` installers. Small file sizes (< ~25 MB typical).
- **Auth:** Admin creates accounts and hands each customer an email + password.
  No public self-service signup.
- **Passwords:** Auto-generated strong password, shown once at creation for the
  admin to send. Customer can change it after first login.
- **Location:** Served at `uptimizeconsulting.ai/portal` (same Netlify repo and
  deploy). Subdomain is a possible later upgrade, out of scope for v1.
- **Constraint:** Must bolt onto the existing static site (single `index.html`
  on Netlify) without disrupting the marketing page.

## Architecture

A vanilla JS single-page app (no framework, no build step — matching the
existing hand-written site's conventions: Montserrat font, navy/teal palette)
served from the same Netlify repo at `/portal`. It talks directly to Supabase
for auth, storage, and access control. One Netlify Function handles the only
operation that needs elevated privileges: creating customer accounts.

```
Browser  (/portal SPA, vanilla JS + supabase-js)
   │  authenticated requests with the logged-in user's JWT
   ▼
Supabase
   ├── Auth        email + password; public signups disabled
   ├── Storage     private bucket "customer-files", RLS per-user folder
   └── Postgres    "profiles" table (role + customer metadata)
   ▲
   │  service-role key (secret, server-side only)
Netlify Function: /.netlify/functions/create-customer
   (admin-only; creates auth user + profile, returns generated password)
```

### Secrets and keys

| Key | Exposure | Used by |
|-----|----------|---------|
| `SUPABASE_URL` | Public (browser) | SPA |
| `SUPABASE_ANON_KEY` | Public (browser) | SPA |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret (Netlify Function env only) | `create-customer` |

The service-role key is never shipped to the browser. All browser-side data
access is governed by Row-Level Security.

## Components

### 1. Storage — `customer-files` bucket (private)

- Single **private** bucket. Objects are keyed by owner user id:
  `{userId}/<filename>`.
- Downloads use the user's JWT (authenticated download) or short-lived signed
  URLs created on demand; no public URLs.
- `.exe` files are stored as ordinary objects — never served as public links,
  never executed by the browser; download-only.

### 2. Access control — RLS on `storage.objects`

- **Customer policy:** a user may `select`/`insert`/`update`/`delete` objects
  only where the first path segment equals their own `auth.uid()`
  (`(storage.foldername(name))[1] = auth.uid()::text`).
- **Admin policy:** a user flagged as admin may perform all operations on every
  folder. Admin status is resolved via a `SECURITY DEFINER` helper function
  `is_admin()` reading the `profiles` table, to avoid recursive RLS evaluation.

### 3. Auth & roles — `profiles` table

```
profiles
  id            uuid  primary key, references auth.users(id)
  email         text
  company       text
  display_name  text
  is_admin      boolean  default false
  created_at    timestamptz default now()
```

- Public sign-ups are disabled in Supabase Auth settings.
- The owner's account is the sole `is_admin = true` row (seeded once at setup).
- RLS on `profiles`: a user can read their own row; an admin can read all rows.

### 4. Account creation — `create-customer` Netlify Function

- Input: `{ email, company, displayName }` plus the caller's Supabase access
  token (sent as a Bearer header).
- Steps:
  1. Verify the caller's token and confirm the caller `is_admin`. Reject
     otherwise (401/403).
  2. Generate a strong random password.
  3. `supabase.auth.admin.createUser({ email, password, email_confirm: true })`.
  4. Insert the matching `profiles` row (`company`, `display_name`,
     `is_admin = false`).
  5. Return `{ email, password }` so the admin can send credentials.
- Holds the service-role key; this is the only place it lives.

### 5. The SPA — one app, role-aware

- **Login screen** (shared): email + password → Supabase session.
- After login, the app reads the user's `profiles` row to determine role.
- **Customer view:** lists files in their own folder; download, upload, delete
  own files; change own password.
- **Admin view:** a customer picker; for the selected customer, the same
  file operations across that customer's folder; plus "Add customer" (calls
  `create-customer`) and "Reset password."

## Data flow

**Admin sends a deliverable**
1. Admin logs in → admin view → picks customer.
2. Uploads file → `storage.from('customer-files').upload('{customerId}/file', ...)`.
   Admin RLS policy permits writing to another user's folder.

**Customer downloads / uploads**
1. Customer logs in → sees only their folder (RLS-enforced list).
2. Download → authenticated download or signed URL.
3. Upload → writes to `{ownUserId}/...`; RLS confirms the path matches their uid.

**Onboarding a customer**
1. Admin → "Add customer" → enters email + company.
2. `create-customer` creates the account and returns a generated password.
3. Admin copies email + password and sends them to the customer out of band.

## Error handling & edge cases

- Wrong credentials → clear inline error, no detail leakage.
- Expired/invalid session → prompt re-login.
- Upload failure → surfaced with retry; client-side max file-size guard.
- Empty folder → "No files yet" empty state.
- Non-admin calling `create-customer` → rejected server-side (defense in depth
  beyond UI hiding).
- Duplicate email on create → friendly "account already exists" message.

## Testing & verification

Manual end-to-end matrix run locally with the Netlify CLI against a dedicated
Supabase project, plus a focused unit test on the function:

1. Admin creates a customer → password returned and account usable.
2. Customer logs in → sees only their own folder.
3. Customer uploads → admin sees it; admin uploads → customer sees it.
4. Customer B cannot access Customer A's files via a direct storage API call
   (RLS rejection verified, not just UI absence).
5. Wrong password, logout, and session expiry behave correctly.
6. `create-customer` rejects non-admin callers and invalid input (unit test).

## Out of scope (v1 / YAGNI)

- `portal.` subdomain (start at `/portal`; easy later move).
- Email delivery of credentials (admin sends manually for now).
- File previews, folders/sub-folders, sharing links, expiring links.
- Notifications, activity log, storage quotas per customer.
- Bulk upload/zip download.

## Open dependencies / setup

- A Supabase project (free tier) for this site.
- Netlify env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- One-time SQL setup: `profiles` table, `is_admin()` function, RLS policies on
  `storage.objects` and `profiles`, create the `customer-files` bucket, seed the
  admin profile row.
