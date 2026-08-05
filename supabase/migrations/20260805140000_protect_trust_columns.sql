-- Migration: make the streamer trust decision actually enforceable
-- Description: pins verification_status/verified_at/verified_by against
--   self-service updates, removes the publicly-readable rejection note, and
--   fixes the payout primary-account default.
-- Affected: public.streamers, public.streamer_payout_accounts
-- Special considerations: closes a privilege-escalation hole; safe to re-run.

-- 1. A streamer could approve themselves
--
-- 20240320123000 grants authenticated users a blanket update of their own
-- streamer row:
--
--   create policy "Allow authenticated update access" ... for update
--     to authenticated
--     using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- Row-level security is exactly that — row level. It has no opinion about
-- *which columns* change, so once 20260805120000 added verification_status to
-- this table, any pending streamer could run
--
--   supabase.from('streamers').update({ verification_status: 'approved' })
--
-- from the browser console with the public anon key and become bookable.
-- The strict RLS on streamer_verification_submissions did not help: it guards
-- the application form, while the flag that actually gates booking lives here.
--
-- A trigger is used rather than a narrower policy because column-level control
-- is not expressible in RLS, and revoking column privileges would break the
-- several `select('*')` reads this app already performs with the anon key.

create or replace function public.enforce_streamer_trust_columns()
returns trigger
language plpgsql
-- Deliberately NOT `security definer`: a definer function runs as its owner, so
-- `current_user` inside it would always be postgres and the guard below would be
-- true for everyone — the trigger would silently protect nothing. Invoker rights
-- keep current_user as the caller's real role. public.is_admin() is still
-- definer, which is what lets it read the allowlist the caller cannot.
set search_path = ''
as $$
begin
  -- Reviewers may set these. PostgREST switches to the service_role role for
  -- service-key requests (app/admin/actions.ts), and migrations or SQL-editor
  -- sessions run as postgres/supabase_admin.
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.is_admin() then
    return new;
  end if;

  -- Everyone else silently keeps the reviewer's decision. Pinning the values
  -- rather than raising an exception is deliberate: a streamer editing their
  -- bio, price, city or availability switch must still succeed, and those
  -- updates legitimately send the whole row back. Only the trust decision is
  -- immovable.
  new.verification_status := old.verification_status;
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;

  return new;
end;
$$;

comment on function public.enforce_streamer_trust_columns() is 'Pins the verification columns on public.streamers for anyone who is not an admin or the service role. RLS cannot restrict individual columns, so without this the table''s pre-existing "update your own row" policy lets a streamer set verification_status = approved themselves.';

drop trigger if exists trg_enforce_streamer_trust_columns on public.streamers;
create trigger trg_enforce_streamer_trust_columns
  before update on public.streamers
  for each row
  execute function public.enforce_streamer_trust_columns();

-- Insert needs the same guard: the insert policy is equally column-blind, so a
-- new streamer could otherwise arrive pre-approved rather than pending.
create or replace function public.force_streamer_pending_on_insert()
returns trigger
language plpgsql
-- Invoker rights, for the same reason as the update trigger above.
set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
     or public.is_admin() then
    return new;
  end if;

  new.verification_status := 'pending';
  new.verified_at := null;
  new.verified_by := null;

  return new;
end;
$$;

comment on function public.force_streamer_pending_on_insert() is 'Every self-service streamer signup starts at pending regardless of what the client posted. Without it the column-blind insert policy would let a signup declare itself approved.';

drop trigger if exists trg_force_streamer_pending_on_insert on public.streamers;
create trigger trg_force_streamer_pending_on_insert
  before insert on public.streamers
  for each row
  execute function public.force_streamer_pending_on_insert();

-- 2. The rejection note was world-readable
--
-- public.streamers grants anon SELECT with `using (true)` over every column, so
-- adding rejection_reason there published an admin's private assessment of a
-- named person — "KTP tampak diedit", "selfie tidak cocok dengan KTP" — to
-- anyone with the anon key, which ships in the browser bundle.
--
-- The note is already stored on streamer_verification_submissions.notes, whose
-- RLS lets only that streamer and admins read it, so the public copy is pure
-- leak and the column goes away. The application reads the note from the
-- submission row instead.
alter table public.streamers
  drop column if exists rejection_reason;

-- 3. A streamer could never add a second payout account
--
-- `is_primary boolean not null default true` combined with the partial unique
-- index on (streamer_id) where is_primary meant any second account inserted
-- without explicitly passing is_primary = false failed on 23505 — and rotating
-- accounts is the case the table was designed for.
alter table public.streamer_payout_accounts
  alter column is_primary set default false;

comment on column public.streamer_payout_accounts.is_primary is 'Exactly one account per streamer may be primary, enforced by a partial unique index. Defaults to false so adding a second account never collides; promoting an account is an explicit act that must demote the current primary in the same transaction.';
