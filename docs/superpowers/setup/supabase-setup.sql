-- Customer File Portal — Supabase schema + RLS setup
-- Run this in the Supabase SQL Editor for project "uptimize-portal".
-- See docs/superpowers/plans/2026-06-12-customer-file-portal.md (Task 0).

-- Bucket (no-op if created via the Storage UI)
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

-- After creating your admin auth user (Dashboard → Authentication → Users → Add user,
-- "Auto Confirm User"), copy its UID and run (replace the UID + email):
-- insert into public.profiles (id, email, is_admin, display_name, company)
-- values ('YOUR-ADMIN-UID', 'you@uptimizeconsulting.ai', true, 'Uptimize Admin', 'Uptimize Consulting AI')
-- on conflict (id) do update set is_admin = true;
