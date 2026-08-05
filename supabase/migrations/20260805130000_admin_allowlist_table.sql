-- Migration: move the admin allowlist from a database setting into a table
-- Description: replaces the `app.admin_emails` GUC that public.is_admin() read
--   with public.admin_users, because hosted Supabase cannot set that GUC at all.
-- Affected: public.admin_users (new), public.is_admin() (redefined)
-- Special considerations: fail-closed. An empty table means nobody is an admin.

-- Why this migration exists
--
-- 20260805120000 defined public.is_admin() to read a comma-separated list from
-- `current_setting('app.admin_emails')`, to be populated with:
--
--   alter database postgres set app.admin_emails = '...';
--
-- That command cannot run on hosted Supabase. The `postgres` role there is not
-- a superuser, and setting a customized (dotted) parameter on a database
-- requires superuser, so the statement fails with:
--
--   ERROR: 42501: permission denied to set parameter "app.admin_emails"
--
-- Without a working allowlist every is_admin() call returns false, which is
-- safe but leaves the streamer verification queue unusable: no one can approve
-- anyone. The allowlist therefore moves into ordinary table data, which the
-- project owner can edit from the SQL editor or the table editor.

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  -- Matched case-insensitively against the caller's JWT email. Stored lowercase
  -- by the citext-style constraint below rather than a citext extension, to keep
  -- this migration free of extension privileges.
  email text not null,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is 'Allowlist of Salda staff who may review streamer verifications and act on admin-only rows. Database counterpart of the ADMIN_EMAILS env var that app/admin/layout.tsx checks. Add a row to grant admin, delete it to revoke.';
comment on column public.admin_users.email is 'Sign-in email, compared case-insensitively to the caller''s JWT email claim.';
comment on column public.admin_users.note is 'Free text for whoever maintains the list: who this person is, why they have access.';

-- One row per person, regardless of the casing someone typed.
create unique index if not exists idx_admin_users_email_lower
  on public.admin_users (lower(email));

-- Carry over anything the GUC already held. On hosted Supabase this is a no-op
-- (the setting could never be applied); on a local or self-hosted database where
-- it *was* set, this preserves the existing admins so behaviour doesn't regress.
do $$
declare
  configured text;
begin
  configured := current_setting('app.admin_emails', true);

  if configured is not null and btrim(configured) <> '' then
    insert into public.admin_users (email, note)
    select btrim(candidate), 'Migrated from the app.admin_emails setting'
    from unnest(string_to_array(lower(configured), ',')) as t (candidate)
    where btrim(candidate) <> ''
    on conflict do nothing;
  end if;
end;
$$;

-- Redefined to read the table. Still `security definer` with an empty
-- search_path: the policies that call this run as ordinary users who have no
-- privileges on public.admin_users, and definer rights also let the function
-- read the table without being blocked by its own row-level security.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(public.admin_users.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

comment on function public.is_admin() is 'True when the caller''s JWT email appears in public.admin_users. Database mirror of the ADMIN_EMAILS allowlist enforced by app/admin/layout.tsx. Fail-closed: an empty table means nobody is an admin.';

grant execute on function public.is_admin() to anon, authenticated, service_role;

-- RLS with no policy for anon/authenticated is the point: the allowlist is not
-- readable or writable through the API by anyone, under any session. It is
-- maintained from the SQL editor or with the service-role key, both of which
-- bypass RLS. Leaving it API-readable would publish the exact set of accounts
-- worth phishing, and API-writable would be privilege escalation.
alter table public.admin_users enable row level security;

revoke all on public.admin_users from anon, authenticated;

-- Grant admin by adding a row (run this in the Supabase SQL editor):
--
--   insert into public.admin_users (email, note)
--   values ('owner@salda.id', 'Founder');
--
-- Revoke by deleting it. The email must match the address the person signs in
-- with, and should also appear in the ADMIN_EMAILS env var so the application
-- layer and the database agree.
