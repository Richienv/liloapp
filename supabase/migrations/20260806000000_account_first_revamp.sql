-- Migration: account-first signup
-- Description: an account now exists BEFORE a role is picked and BEFORE a
--   streamer profile is filled in, so columns that were mandatory when signup
--   was a single 19-field transaction must tolerate a half-finished row. Adds
--   server-side draft storage and funnel instrumentation.
-- Affected: public.users, public.streamers,
--   public.signup_drafts (new), public.onboarding_events (new)
-- Special considerations:
--   - The production database has live users and streamers. Nothing here
--     rewrites or invalidates an existing row, and the whole file is safe to
--     re-run: every ALTER is guarded, every CREATE is `if not exists`, every
--     policy is dropped before it is recreated.
--   - THE LIVE SCHEMA HAS DRIFTED from 20240320123000_create_streamers_table.sql
--     (the application writes first_name/last_name, not the `name` column that
--     migration declared). Every relaxation below therefore consults
--     information_schema first and touches a column only if it is really there
--     and really NOT NULL. Nothing assumes a column exists.
--
-- Why this shape at all
--
--   The old flow asked for ~19 fields, a 4:5 photo, a video and five portfolio
--   images in one transaction, before any account was created. Someone who gave
--   up at step 4 of 6 left nothing behind — no email, no phone, no way to
--   follow up, and no record that they had even tried. Splitting the work means
--   the database has to hold the intermediate states: an account with no role,
--   a streamer row with no price yet, a draft that survives closing the tab,
--   and enough events to see where people stop.


-- ============================================================================
-- 1) USERS: A ROLE IS SOMETHING YOU CHOOSE LATER
--
-- The account is created first (email/password or Google, name, WhatsApp) and
-- the role picker comes after, so `user_type` cannot be required at insert
-- time any more. NULL now carries a specific meaning:
--
--   NULL = this person has an account but has not yet said whether they are a
--          brand or a host.
--
-- `lib/auth-redirect.ts` reads exactly that: `nextPathFor()` sends a NULL
-- user_type straight to /pilih-peran, because nothing else in the product is
-- meaningful until the question is answered.
--
-- Existing rows are untouched — they already have 'client' or 'streamer' and
-- keep it. Dropping a NOT NULL does not rewrite the table and does not
-- invalidate any existing value.
-- ============================================================================

do $$
begin
  -- Guarded: on a database where this already ran, or where the column was
  -- never NOT NULL to begin with, the ALTER is skipped rather than repeated.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'user_type'
      and is_nullable = 'NO'
  ) then
    alter table public.users
      alter column user_type drop not null;
  end if;
end;
$$;

comment on column public.users.user_type is 'What this person came here to do: ''client'' (brand booking a host) or ''streamer'' (host). NULL means the account exists but the role picker has not been answered yet — an account-first signup creates the row before the question is asked, and lib/auth-redirect.ts routes NULL to /pilih-peran. Nullable since the account-first revamp; every row that predates it already carries a role.';

alter table public.users
  add column if not exists role_selected_at timestamptz;

comment on column public.users.role_selected_at is 'When the role picker was answered. Separate from created_at so we can measure the gap between "account exists" and "role chosen" — the single step the account-first revamp is betting on. NULL for rows that predate this column even though they have a user_type: we genuinely do not know when they chose, and back-dating it would fabricate funnel data.';

-- Finds accounts stranded before the role picker (the new top-of-funnel
-- drop-off). A partial index stays tiny — it holds only the stranded rows,
-- not the whole table — and shrinks by itself as people pick a role.
create index if not exists idx_users_awaiting_role
  on public.users (id)
  where user_type is null;


-- ============================================================================
-- 2) STREAMERS: A PROFILE THAT GETS FILLED IN OVER TIME
--
-- A streamer row is now created the moment someone picks the "host" role, and
-- completed later across three milestones (lib/milestones.ts). At creation
-- time we know only who they are, so platform / category / price / photo have
-- to be allowed to arrive later.
--
-- WHY THIS DOES NOT LEAK HALF-BUILT PROFILES INTO THE MARKETPLACE
--
--   The bookability rule (see supabase/SCHEMA_REFERENCE.md) is
--
--       is_active = true AND verification_status = 'approved'
--
--   and every public query applies it. A row created by the role picker starts
--   at verification_status = 'pending' — that is the column default, and
--   `trg_force_streamer_pending_on_insert` (20260805140000) rewrites it to
--   'pending' anyway for anyone who is not an admin or the service role. So an
--   unfinished profile is invisible to the marketplace, the city pages, the
--   sitemap and the public profile page no matter how empty it is. Relaxing
--   NOT NULL widens what can be *stored*, never what can be *seen*.
--
--   The existing CHECK constraints stay in force and still work: a CHECK that
--   evaluates to NULL passes, so `check (price >= 0)` accepts a NULL price
--   while still rejecting a negative one.
--
-- first_name / last_name are deliberately NOT relaxed. The account already
-- collected a name before the role picker, so a streamer row is never created
-- without one, and keeping the constraint means a nameless profile stays
-- impossible.
-- ============================================================================

do $$
declare
  -- Exactly the fields the old signup form demanded up front and the new
  -- milestone flow collects afterwards. 20240320123000 declared all of these
  -- NOT NULL; which of them still exist, and which are still NOT NULL, is
  -- whatever the live database actually says.
  deferred_columns text[] := array[
    'name', 'platform', 'category', 'price', 'image_url', 'rating'
  ];
  target text;
begin
  foreach target in array deferred_columns
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'streamers'
        and column_name = target
        and is_nullable = 'NO'
    ) then
      execute format(
        'alter table public.streamers alter column %I drop not null',
        target
      );
    end if;
  end loop;
end;
$$;


-- ============================================================================
-- 3) STREAMERS: WHEN THE PROFILE FIRST BECAME LISTABLE
--
-- `profile_published_at` records the moment a profile first carried everything
-- a listing renders. It is an observation, not a switch: nothing reads it to
-- decide visibility (that is still the bookability rule above, and
-- lib/milestones.ts derives "published" from the data itself so it cannot drift
-- out of sync). Its job is to answer "how long does the first milestone
-- actually take?" — a question we currently cannot answer at all.
-- ============================================================================

do $$
declare
  column_already_existed boolean;
  streamers_has_created_at boolean;
  -- Ported from isProfilePublishable() in lib/milestones.ts: who they are, how
  -- to reach them, what they cost, what they do. Gallery photos and the intro
  -- video are portfolio polish and deliberately excluded — demanding them is
  -- what made the original form unfinishable.
  publishable_predicate constant text :=
    $sql$
         coalesce(btrim(username), '') <> ''
     and coalesce(btrim(image_url), '') <> ''
     and (coalesce(btrim(city_slug), '') <> '' or coalesce(btrim(location), '') <> '')
     and coalesce(btrim(category), '') <> ''
     and coalesce(btrim(platform), '') <> ''
     and coalesce(price, 0) > 0
     and coalesce(btrim(bio), '') <> ''
    $sql$;
  publishable_columns constant text[] := array[
    'username', 'image_url', 'city_slug', 'location',
    'category', 'platform', 'price', 'bio'
  ];
  publishable_columns_present integer;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'streamers'
      and column_name = 'profile_published_at'
  )
  into column_already_existed;

  if not column_already_existed then
    alter table public.streamers
      add column profile_published_at timestamptz;
  end if;

  -- How many of the fields the predicate reads are actually present. Under the
  -- documented schema drift this must be checked before any statement that
  -- names them, or the migration would fail on a database missing one.
  select count(*)
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'streamers'
    and column_name = any (publishable_columns)
  into publishable_columns_present;

  if publishable_columns_present <> array_length(publishable_columns, 1) then
    raise notice
      'streamers is missing one of % — skipping the profile_published_at backfill and trigger; the application must stamp the column itself.',
      publishable_columns;
    return;
  end if;

  if not column_already_existed then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'streamers'
        and column_name = 'created_at'
    )
    into streamers_has_created_at;

    /*
      One-time backfill, on the run that creates the column only.

      Under the old signup a profile was complete from the instant the row was
      inserted — the form refused to submit otherwise — so created_at is the
      honest answer for a row that is publishable today. Rows that are still
      incomplete keep NULL, which is also honest: they never were listable.

      Guarded by `if not column_already_existed` rather than by
      `where profile_published_at is null` so a re-run can never re-stamp a
      profile whose timestamp was later corrected by hand.
    */
    execute format(
      'update public.streamers set profile_published_at = %s where %s',
      case
        when streamers_has_created_at then 'coalesce(created_at, now())'
        else 'now()'
      end,
      publishable_predicate
    );
  end if;
end;
$$;

comment on column public.streamers.profile_published_at is 'When this profile FIRST carried every field a listing needs (the "publish" milestone in lib/milestones.ts). Stamped once and never cleared, so it survives a streamer later blanking a field — it answers how long the first milestone took, and is not itself a visibility switch. NULL means the profile has never been complete. Rows that predate the account-first revamp were backfilled from created_at, since the old one-shot form could not produce an incomplete row.';

-- Stamping is done by a trigger rather than left to the application because a
-- profile can be completed from several places (setup wizard, settings page,
-- an admin fixing a record, the legacy one-shot signup while it is still
-- deployed) and a timestamp only one of them remembers to write is worse than
-- no timestamp at all. It only ever moves NULL -> now(), so it cannot fight
-- with application code that also sets it, and cannot rewrite history.
create or replace function public.salda_stamp_streamer_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.profile_published_at is null
     and coalesce(btrim(new.username), '') <> ''
     and coalesce(btrim(new.image_url), '') <> ''
     and (coalesce(btrim(new.city_slug), '') <> '' or coalesce(btrim(new.location), '') <> '')
     and coalesce(btrim(new.category), '') <> ''
     and coalesce(btrim(new.platform), '') <> ''
     and coalesce(new.price, 0) > 0
     and coalesce(btrim(new.bio), '') <> ''
  then
    new.profile_published_at := now();
  end if;

  return new;
end;
$$;

comment on function public.salda_stamp_streamer_published_at() is 'Stamps streamers.profile_published_at the first time a row satisfies the publish milestone from lib/milestones.ts. Set-once: it never overwrites an existing value and never clears one, so blanking a field later does not erase the fact that the profile was once live.';

do $$
declare
  required_columns constant text[] := array[
    'username', 'image_url', 'city_slug', 'location',
    'category', 'platform', 'price', 'bio', 'profile_published_at'
  ];
  required_columns_present integer;
begin
  select count(*)
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'streamers'
    and column_name = any (required_columns)
  into required_columns_present;

  -- Attaching a trigger whose body names a column that does not exist would
  -- fail at runtime, on the first write — that is, it would break every
  -- streamer insert and update in production rather than failing here. So the
  -- trigger is attached only when the live table really has all of them.
  if required_columns_present = array_length(required_columns, 1) then
    drop trigger if exists trg_stamp_streamer_published_at on public.streamers;
    create trigger trg_stamp_streamer_published_at
      before insert or update on public.streamers
      for each row
      execute function public.salda_stamp_streamer_published_at();
  else
    raise notice
      'streamers is missing one of % — trg_stamp_streamer_published_at not installed.',
      required_columns;
  end if;
end;
$$;

-- Every account-first page load resolves "which streamer row is mine?" from
-- the signed-in user id, and the role picker checks the same thing before
-- creating a row. Without this that is a sequential scan on every request.
create index if not exists idx_streamers_user_id
  on public.streamers (user_id);

-- The funnel question this table cannot answer today: of the people who picked
-- "host", how many ever got a listable profile? Partial, so it indexes only
-- the unfinished ones.
create index if not exists idx_streamers_unpublished
  on public.streamers (user_id)
  where profile_published_at is null;


-- ============================================================================
-- 4) SIGNUP DRAFTS
--
-- Replaces the localStorage draft. localStorage was the wrong place for three
-- reasons: it kept a person's HOME ADDRESS in plaintext on what is very often
-- a shared or borrowed device, it did not survive switching from a phone to a
-- laptop (the exact moment a long form gets abandoned), and it was invisible to
-- us, so an abandoned draft told us nothing.
--
-- One row per user: the primary key is the user id, so "save my draft" is a
-- single upsert with no chance of accumulating duplicates, and `on delete
-- cascade` means deleting an account takes the draft with it.
-- ============================================================================

create table if not exists public.signup_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.signup_drafts is 'Server-side scratch space for a signup or setup flow the user has not finished, so progress survives closing the tab or switching device. Replaces a localStorage draft that kept a home address in plaintext on shared devices. NEVER store a password, a token, or the contents of an uploaded file here — this row is ordinary application data with none of the protections those need, and files belong in storage with only their path recorded.';
comment on column public.signup_drafts.user_id is 'Owner and primary key: one draft per account, so saving is an upsert and an abandoned draft cannot fan out into duplicates. Cascades on account deletion.';
comment on column public.signup_drafts.kind is 'Which flow this draft belongs to, e.g. ''streamer_setup''. Kept as free text rather than an enum so a new flow does not need a migration; the application decides how to read `data` from it.';
comment on column public.signup_drafts.data is 'Partially-filled form values, shape owned by the application. Text fields only — no passwords, no tokens, no base64 file contents (see the size check below).';
comment on column public.signup_drafts.updated_at is 'Last save, stamped by the salda_set_updated_at trigger. Doubles as the age of an abandoned draft, which is what a cleanup job and any "you left something unfinished" nudge both key off.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.signup_drafts'::regclass
      and conname = 'signup_drafts_kind_not_blank'
  ) then
    alter table public.signup_drafts
      add constraint signup_drafts_kind_not_blank
      check (btrim(kind) <> '');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.signup_drafts'::regclass
      and conname = 'signup_drafts_data_size'
  ) then
    -- 32 KB is roomy for the text fields of any form we have and far too small
    -- for a base64 image. The cap is here to make the "no file contents" rule
    -- in the comments above enforceable rather than merely stated, and to stop
    -- one abandoned draft from bloating a table nobody reads.
    alter table public.signup_drafts
      add constraint signup_drafts_data_size
      check (octet_length(data::text) <= 32768);
  end if;
end;
$$;

-- Ages out abandoned drafts. A draft is disposable by definition, and keeping
-- someone's half-typed personal details forever is a liability, not a feature.
create index if not exists idx_signup_drafts_updated_at
  on public.signup_drafts (updated_at);

drop trigger if exists set_updated_at on public.signup_drafts;
create trigger set_updated_at
  before update on public.signup_drafts
  for each row
  execute function public.salda_set_updated_at();

alter table public.signup_drafts enable row level security;

-- No policy is granted to `anon`, and the table privilege is revoked outright:
-- a draft holds an address and a phone number, and the anon key ships inside
-- the browser bundle. An absent policy already denies, but revoking as well
-- means a future policy added without thinking still cannot open this up.
revoke all on public.signup_drafts from anon;

drop policy if exists "signup_drafts_select_own" on public.signup_drafts;
create policy "signup_drafts_select_own"
  on public.signup_drafts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "signup_drafts_insert_own" on public.signup_drafts;
create policy "signup_drafts_insert_own"
  on public.signup_drafts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "signup_drafts_update_own" on public.signup_drafts;
create policy "signup_drafts_update_own"
  on public.signup_drafts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "signup_drafts_delete_own" on public.signup_drafts;
create policy "signup_drafts_delete_own"
  on public.signup_drafts
  for delete
  to authenticated
  using (user_id = auth.uid());

comment on policy "signup_drafts_select_own" on public.signup_drafts is 'A user resumes only their own draft. Without the user_id = auth.uid() test any signed-in account could read every unfinished signup on the platform, addresses included.';
comment on policy "signup_drafts_insert_own" on public.signup_drafts is 'A draft can only be created for yourself — the with-check is what stops a client from planting data under someone else''s account id.';
comment on policy "signup_drafts_update_own" on public.signup_drafts is 'Autosave path. The same test appears in USING and WITH CHECK so a row cannot be updated into belonging to a different user.';
comment on policy "signup_drafts_delete_own" on public.signup_drafts is 'Finishing or abandoning a flow should leave nothing behind; a user can always throw their own draft away.';

-- Deliberately no admin read policy: unlike a KYC submission, an unfinished
-- draft is not evidence for any decision Salda has to make, so staff have no
-- reason to read half-typed addresses. Support goes through the service-role
-- key, which is auditable.


-- ============================================================================
-- 5) ONBOARDING EVENTS
--
-- Right now we cannot tell whether a streamer quit at the photo or at the
-- price, so every decision about the signup flow is guesswork dressed up as
-- judgement. This table is the cheapest possible fix: an append-only log of
-- "this happened at this step", with a jsonb bag for whatever the step needs.
--
-- It is deliberately not a general analytics table. It answers one question —
-- where do people stop — and should stay small enough that nobody is tempted
-- to make it the system of record for anything.
-- ============================================================================

create table if not exists public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.onboarding_events is 'Append-only funnel log for signup and streamer setup: which step someone reached, and when. Exists because the drop-off point in the old 6-step form was pure guesswork. Not a general analytics table and not a system of record — anything that matters is stored on the row it belongs to.';
comment on column public.onboarding_events.user_id is 'Who the event belongs to. `on delete set null` rather than cascade on purpose: when an account is deleted the person must stop being identifiable, but the funnel shape they contributed to should not silently change underneath a report. NULL is also the legitimate value for a step that happens before an account exists, which only the service role can record.';
comment on column public.onboarding_events.event is 'Step identifier, e.g. ''signup_started'', ''role_selected'', ''setup_photo_uploaded'', ''setup_price_set''. Free text so instrumenting a new step costs nothing; the naming convention lives with the application code that emits it.';
comment on column public.onboarding_events.props is 'Small bag of context for the step — which field failed validation, which milestone, how many attempts. Never personal data: this table is readable by every admin and is the wrong place for anything a person would mind being read.';
comment on column public.onboarding_events.created_at is 'When the step happened. Half the value of the table is the gap between two of these.';

-- The funnel query is "how many of event X per day", so the index leads on
-- event and then orders by time within it.
create index if not exists idx_onboarding_events_event_created_at
  on public.onboarding_events (event, created_at);

-- The other half is following one person through their steps, when a specific
-- report of "I got stuck" needs explaining.
create index if not exists idx_onboarding_events_user
  on public.onboarding_events (user_id);

alter table public.onboarding_events enable row level security;

-- As above: nothing for `anon`. Events are written by signed-in users, or
-- server-side with the service-role key for steps that precede the account.
-- Letting the browser's public key write here would also make the funnel
-- trivially forgeable by anyone who read the bundle.
revoke all on public.onboarding_events from anon;

drop policy if exists "onboarding_events_insert_own" on public.onboarding_events;
create policy "onboarding_events_insert_own"
  on public.onboarding_events
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "onboarding_events_select_admin" on public.onboarding_events;
create policy "onboarding_events_select_admin"
  on public.onboarding_events
  for select
  to authenticated
  using (public.is_admin());

comment on policy "onboarding_events_insert_own" on public.onboarding_events is 'A signed-in user records their own progress and nobody else''s, so one account cannot pollute another''s funnel. Pre-account events carry user_id = null and can only be written with the service-role key, which bypasses RLS.';
comment on policy "onboarding_events_select_admin" on public.onboarding_events is 'Only the ADMIN_EMAILS allowlist reads the funnel. A user has no reason to read this table, and letting them read it would expose every other account''s progress — including who is stuck in verification.';

-- Deliberately no UPDATE and no DELETE policy: the log is append-only. An event
-- that can be rewritten by the person it describes measures nothing. Pruning
-- old rows is a service-role job.
