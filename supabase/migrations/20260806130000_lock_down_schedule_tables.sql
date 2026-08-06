-- ============================================================================
-- Enable RLS on the last five unprotected tables.
--
--   public.streamer_active_schedules
--   public.streamer_schedule
--   public.accepted_bookings
--   public.booking_status_history
--   public.streamer_price_history
--
-- WHAT IS OPEN RIGHT NOW
--
-- The anon key ships in the browser bundle. With RLS off, anyone holding it can
-- write these tables directly. The two schedule tables are the expensive ones:
--
--   update public.streamer_active_schedules set schedule = '[]'::jsonb;
--
-- closes every host's calendar on the platform, and nothing in the application
-- would report it — the booking flow would simply start showing "tidak ada jam
-- tersedia" for everybody. The inverse is worse: writing slots a host never
-- offered makes them bookable at hours they are not working, and the first they
-- hear of it is a brand waiting on a stream that is not coming.
--
-- WHY THIS MIGRATION INTROSPECTS INSTEAD OF ASSUMING
--
-- None of these five tables is created by any migration in this repository.
-- They exist only in the live database, so their exact shape is not knowable
-- from the source tree — it is inferred from the queries the application makes.
-- Every block below therefore checks that the object exists, that it is a table
-- rather than a view, and that the column its policies depend on is really
-- there. Anything that does not match is skipped with a NOTICE naming what was
-- missing, rather than half-applied.
--
-- THE INSERT-POLICY DECISION, WHICH IS LOAD-BEARING
--
-- `streamer_price_history` and `booking_status_history` have no writes anywhere
-- in the application code. The obvious move is to grant no INSERT policy at all
-- and let only the service role write them. That would be a mistake here.
--
-- Both tables look like trigger-maintained audit logs, and no migration in this
-- repo defines those triggers either. A trigger function that is NOT `security
-- definer` runs with the privileges of whoever fired it — so a host updating
-- their own price, or a streamer accepting a booking, would have the audit
-- insert refused by RLS and the whole statement would roll back. Enabling RLS
-- would break the very actions the audit log exists to record.
--
-- So both get a narrow INSERT policy: you may write a history row about a
-- record you are party to. That is enough for an invoker-rights trigger to keep
-- working, and it still stops anyone forging history about somebody else.
-- Neither gets UPDATE or DELETE — an audit log that can be rewritten is not one.
--
-- Idempotent. Safe to run more than once.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Shared helpers for the checks below.
-- ----------------------------------------------------------------------------
create or replace function public.salda_is_plain_table(target text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = target
      -- 'r' ordinary table, 'p' partitioned table. Deliberately excludes 'v'
      -- and 'm': `alter table ... enable row level security` errors on a view,
      -- which would abort the whole migration.
      and c.relkind in ('r', 'p')
  );
$$;

create or replace function public.salda_has_column(target text, col text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = target
      and a.attname = col
      and a.attnum > 0
      and not a.attisdropped
  );
$$;

comment on function public.salda_is_plain_table(text) is
  'True when public.<target> is an ordinary or partitioned table. Used by the RLS migrations to skip views, which cannot have RLS enabled.';
comment on function public.salda_has_column(text, text) is
  'True when public.<target> has a live column named <col>. Used by the RLS migrations to verify an inferred schema before writing policies against it.';


-- ----------------------------------------------------------------------------
-- 0b. Ownership predicates.
--
-- These exist as `security definer` functions rather than as inline subqueries
-- in each policy, and that is not a style preference — it is a correctness fix
-- found by testing.
--
-- A policy's USING/WITH CHECK expression is evaluated with the *caller's*
-- privileges, not the table owner's. So a policy written as
--
--   using (streamer_id in (select id from public.streamers where user_id = auth.uid()))
--
-- silently depends on the caller holding SELECT on public.streamers. Today they
-- do, because the marketplace reads that table. The day someone tightens those
-- grants, every policy here starts raising "permission denied for table
-- streamers" instead of returning false — which turns a schedule save into a
-- hard error rather than a denial. Reproduced against PostgreSQL 16 while
-- writing this migration.
--
-- A definer function runs as its owner, so the predicate keeps working no
-- matter what the caller may read. `auth.uid()` still resolves inside it: it
-- reads the request's JWT claims out of a session setting, which survives the
-- privilege switch.
--
-- STABLE, so the planner evaluates them once per statement rather than per row.
-- ----------------------------------------------------------------------------
create or replace function public.salda_owns_streamer(target bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.streamers s
    where s.id = target
      and s.user_id = auth.uid()
  );
$$;

create or replace function public.salda_in_booking(target bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    where b.id = target
      and (
        b.client_id = auth.uid()
        or exists (
          select 1 from public.streamers s
          where s.id = b.streamer_id and s.user_id = auth.uid()
        )
      )
  );
$$;

comment on function public.salda_owns_streamer(bigint) is
  'True when the calling user owns the given streamers row. security definer so RLS policies using it do not require the caller to hold SELECT on public.streamers.';
comment on function public.salda_in_booking(bigint) is
  'True when the calling user is either side of the given booking — the client who made it or the host who accepted it.';

revoke all on function public.salda_owns_streamer(bigint) from public;
revoke all on function public.salda_in_booking(bigint) from public;
grant execute on function public.salda_owns_streamer(bigint) to authenticated, service_role;
grant execute on function public.salda_in_booking(bigint) to authenticated, service_role;


-- ============================================================================
-- 1. public.streamer_active_schedules
--
--    One row per host, `schedule` a jsonb array of {day, slots[]}. Written by
--    app/streamer-schedule/page.tsx (upsert, from the browser) and by
--    app/streamer-setup/actions.ts when a profile is published.
--
--    SELECT stays open to anon. This is public availability: it is what the
--    booking calendar draws, and it is not information the host is hiding — the
--    hours they work are the product. Locking reads would break the calendar for
--    signed-out visitors browsing a profile.
-- ============================================================================
do $$
begin
  if not public.salda_is_plain_table('streamer_active_schedules') then
    raise notice 'SKIPPED streamer_active_schedules: not an ordinary table in schema public.';
  elsif not public.salda_has_column('streamer_active_schedules', 'streamer_id') then
    raise notice 'SKIPPED streamer_active_schedules: no streamer_id column, so ownership cannot be established.';
  else
    execute 'alter table public.streamer_active_schedules enable row level security';

    -- Grants first. RLS narrows what a role may reach; it cannot grant a
    -- privilege the role does not hold, and a revoked write is refused before
    -- any policy is consulted. The two layers are independent on purpose.
    execute 'revoke all on public.streamer_active_schedules from anon';
    execute 'grant select on public.streamer_active_schedules to anon';
    execute 'revoke all on public.streamer_active_schedules from authenticated';
    execute 'grant select, insert, update, delete on public.streamer_active_schedules to authenticated';

    execute 'drop policy if exists "sas_select_all" on public.streamer_active_schedules';
    execute $p$
      create policy "sas_select_all" on public.streamer_active_schedules
        for select to anon, authenticated
        using (true)
    $p$;

    -- `upsert` is INSERT ... ON CONFLICT DO UPDATE, so it needs both policies.
    -- With only one of them a first save works and every later save silently
    -- touches zero rows, or the reverse.
    execute 'drop policy if exists "sas_insert_own" on public.streamer_active_schedules';
    execute $p$
      create policy "sas_insert_own" on public.streamer_active_schedules
        for insert to authenticated
        with check (
          public.salda_owns_streamer(streamer_id)
        )
    $p$;

    execute 'drop policy if exists "sas_update_own" on public.streamer_active_schedules';
    execute $p$
      create policy "sas_update_own" on public.streamer_active_schedules
        for update to authenticated
        using (
          public.salda_owns_streamer(streamer_id)
        )
        -- Without WITH CHECK, a host could pass the USING test on their own row
        -- and then rewrite streamer_id to point at somebody else's.
        with check (
          public.salda_owns_streamer(streamer_id)
        )
    $p$;

    execute 'drop policy if exists "sas_delete_own" on public.streamer_active_schedules';
    execute $p$
      create policy "sas_delete_own" on public.streamer_active_schedules
        for delete to authenticated
        using (
          public.salda_owns_streamer(streamer_id)
        )
    $p$;

    raise notice 'streamer_active_schedules: RLS on. Public read, owner-only write.';
  end if;
end
$$;


-- ============================================================================
-- 2. public.streamer_schedule
--
--    The editable weekly grid behind the compiled `streamer_active_schedules`
--    row: one row per (day_of_week, start_time, end_time, is_available).
--
--    Read only by its owner — app/streamer-schedule and app/streamer-setup. The
--    booking calendar reads `streamer_active_schedules`, never this — so unlike
--    that table, this one does not need to be publicly readable, and a host's
--    draft availability stops being world-visible.
-- ============================================================================
do $$
begin
  if not public.salda_is_plain_table('streamer_schedule') then
    raise notice 'SKIPPED streamer_schedule: not an ordinary table in schema public.';
  elsif not public.salda_has_column('streamer_schedule', 'streamer_id') then
    raise notice 'SKIPPED streamer_schedule: no streamer_id column, so ownership cannot be established.';
  else
    execute 'alter table public.streamer_schedule enable row level security';

    execute 'revoke all on public.streamer_schedule from anon';
    execute 'revoke all on public.streamer_schedule from authenticated';
    execute 'grant select, insert, update, delete on public.streamer_schedule to authenticated';

    execute 'drop policy if exists "ss_select_own" on public.streamer_schedule';
    execute $p$
      create policy "ss_select_own" on public.streamer_schedule
        for select to authenticated
        using (
          public.salda_owns_streamer(streamer_id)
          or public.is_admin()
        )
    $p$;

    execute 'drop policy if exists "ss_insert_own" on public.streamer_schedule';
    execute $p$
      create policy "ss_insert_own" on public.streamer_schedule
        for insert to authenticated
        with check (
          public.salda_owns_streamer(streamer_id)
        )
    $p$;

    execute 'drop policy if exists "ss_update_own" on public.streamer_schedule';
    execute $p$
      create policy "ss_update_own" on public.streamer_schedule
        for update to authenticated
        using (
          public.salda_owns_streamer(streamer_id)
        )
        with check (
          public.salda_owns_streamer(streamer_id)
        )
    $p$;

    execute 'drop policy if exists "ss_delete_own" on public.streamer_schedule';
    execute $p$
      create policy "ss_delete_own" on public.streamer_schedule
        for delete to authenticated
        using (
          public.salda_owns_streamer(streamer_id)
        )
    $p$;

    raise notice 'streamer_schedule: RLS on. Owner-only, admin may read.';
  end if;
end
$$;


-- ============================================================================
-- 3. public.accepted_bookings
--
--    Read in exactly one place — app/streamer-schedule, filtered by
--    `streamer_id` and a `booking_date` range — and written nowhere in the
--    application. It may well be a view over `bookings`; the block below finds
--    out rather than guessing, because `alter table ... enable row level
--    security` on a view aborts the transaction.
--
--    If it IS a view: on PostgreSQL 15+ a view can be made to respect the
--    caller's RLS with `security_invoker = true`, which makes it inherit
--    `bookings`' existing policies instead of running as its owner. That is
--    strictly better than adding policies here, so that is what happens.
-- ============================================================================
do $$
declare
  kind char;
begin
  select c.relkind into kind
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'accepted_bookings';

  if kind is null then
    raise notice 'SKIPPED accepted_bookings: no such object in schema public.';

  elsif kind = 'v' then
    -- security_invoker exists from PostgreSQL 15. Supabase is well past that,
    -- but the version check keeps this migration honest on an older instance
    -- rather than failing with a confusing syntax error.
    if current_setting('server_version_num')::int >= 150000 then
      execute 'alter view public.accepted_bookings set (security_invoker = true)';
      execute 'revoke all on public.accepted_bookings from anon';
      execute 'revoke all on public.accepted_bookings from authenticated';
      execute 'grant select on public.accepted_bookings to authenticated';
      raise notice 'accepted_bookings is a VIEW: set security_invoker, so it now honours the RLS on its base tables.';
    else
      raise notice 'SKIPPED accepted_bookings: it is a view and this server predates security_invoker (needs PG 15+).';
    end if;

  elsif kind = 'm' then
    -- A materialized view has no RLS and no security_invoker. All that can be
    -- done is to stop the browser roles reading it directly.
    execute 'revoke all on public.accepted_bookings from anon';
    execute 'revoke all on public.accepted_bookings from authenticated';
    raise notice 'accepted_bookings is a MATERIALIZED VIEW: revoked anon/authenticated access. It cannot carry RLS; read it through the API instead.';

  elsif not public.salda_has_column('accepted_bookings', 'streamer_id') then
    raise notice 'SKIPPED accepted_bookings: table exists but has no streamer_id column, so ownership cannot be established.';

  else
    execute 'alter table public.accepted_bookings enable row level security';
    execute 'revoke all on public.accepted_bookings from anon';
    execute 'revoke all on public.accepted_bookings from authenticated';
    execute 'grant select on public.accepted_bookings to authenticated';

    execute 'drop policy if exists "ab_select_own" on public.accepted_bookings';
    execute $p$
      create policy "ab_select_own" on public.accepted_bookings
        for select to authenticated
        using (
          public.salda_owns_streamer(streamer_id)
          or public.is_admin()
        )
    $p$;

    -- No write policies. Nothing in the application writes this table, and if
    -- something in the database does, it does so as the service role or through
    -- a definer function — neither of which consults these policies.
    raise notice 'accepted_bookings: RLS on. Owner-only read, no client writes.';
  end if;
end
$$;


-- ============================================================================
-- 4. public.booking_status_history
--
--    Zero references anywhere in the application — no read, no write. Almost
--    certainly a trigger-maintained audit trail on `bookings`.
--
--    Read access goes to the two people the booking is actually about, plus
--    admins. Insert is allowed only for a booking the caller is party to, which
--    is what keeps an invoker-rights trigger working (see the header). Never
--    update, never delete.
-- ============================================================================
do $$
begin
  if not public.salda_is_plain_table('booking_status_history') then
    raise notice 'SKIPPED booking_status_history: not an ordinary table in schema public.';
  elsif not public.salda_has_column('booking_status_history', 'booking_id') then
    -- Without booking_id there is no way to say who a history row is about, and
    -- a policy that cannot identify its subject can only be `true` or `false`.
    -- Refuse to guess: lock the browser roles out entirely and say so.
    execute 'alter table public.booking_status_history enable row level security';
    execute 'revoke all on public.booking_status_history from anon';
    execute 'revoke all on public.booking_status_history from authenticated';
    raise notice 'booking_status_history: no booking_id column. RLS enabled with NO policies and grants revoked — service role only. Add policies by hand if a client ever needs to read this.';
  else
    execute 'alter table public.booking_status_history enable row level security';
    execute 'revoke all on public.booking_status_history from anon';
    execute 'revoke all on public.booking_status_history from authenticated';
    execute 'grant select, insert on public.booking_status_history to authenticated';

    execute 'drop policy if exists "bsh_select_participant" on public.booking_status_history';
    execute $p$
      create policy "bsh_select_participant" on public.booking_status_history
        for select to authenticated
        using (
          public.salda_in_booking(booking_id)
          or public.is_admin()
        )
    $p$;

    execute 'drop policy if exists "bsh_insert_participant" on public.booking_status_history';
    execute $p$
      create policy "bsh_insert_participant" on public.booking_status_history
        for insert to authenticated
        with check (
          public.salda_in_booking(booking_id)
        )
    $p$;

    raise notice 'booking_status_history: RLS on. Participants read and append; nobody rewrites.';
  end if;
end
$$;


-- ============================================================================
-- 5. public.streamer_price_history
--
--    Read by its owner on /settings, both directly and as a PostgREST embedded
--    resource under `streamers` — an embed needs SELECT on the embedded table in
--    its own right, so the owner policy has to cover it or the settings page
--    silently loses its price history.
--
--    Not public: what a host used to charge, and how often they have moved, is
--    negotiating information. The public card shows `previous_price` and
--    `discount_percentage` off the `streamers` row, so nothing on the
--    marketplace depends on reading this.
-- ============================================================================
do $$
begin
  if not public.salda_is_plain_table('streamer_price_history') then
    raise notice 'SKIPPED streamer_price_history: not an ordinary table in schema public.';
  elsif not public.salda_has_column('streamer_price_history', 'streamer_id') then
    raise notice 'SKIPPED streamer_price_history: no streamer_id column, so ownership cannot be established.';
  else
    execute 'alter table public.streamer_price_history enable row level security';
    execute 'revoke all on public.streamer_price_history from anon';
    execute 'revoke all on public.streamer_price_history from authenticated';
    execute 'grant select, insert on public.streamer_price_history to authenticated';

    execute 'drop policy if exists "sph_select_own" on public.streamer_price_history';
    execute $p$
      create policy "sph_select_own" on public.streamer_price_history
        for select to authenticated
        using (
          public.salda_owns_streamer(streamer_id)
          or public.is_admin()
        )
    $p$;

    -- Append-only, and only about yourself. This is the policy that keeps a
    -- non-definer trigger on `streamers.price` working: the host firing it owns
    -- the streamer row, so the history insert passes.
    execute 'drop policy if exists "sph_insert_own" on public.streamer_price_history';
    execute $p$
      create policy "sph_insert_own" on public.streamer_price_history
        for insert to authenticated
        with check (
          public.salda_owns_streamer(streamer_id)
        )
    $p$;

    raise notice 'streamer_price_history: RLS on. Owner reads and appends; no rewrites.';
  end if;
end
$$;


-- ============================================================================
-- 6. Report.
--
--    RLS being ON with zero policies is indistinguishable, from the outside,
--    from RLS being ON and working — both answer every client query with an
--    empty set. This prints what actually landed so the operator can see which
--    blocks ran and which were skipped.
-- ============================================================================
do $$
declare
  r record;
begin
  raise notice '--- RLS status after this migration ---';
  for r in
    select
      c.relname               as table_name,
      c.relkind               as kind,
      c.relrowsecurity        as rls_enabled,
      (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'streamer_active_schedules', 'streamer_schedule', 'accepted_bookings',
        'booking_status_history', 'streamer_price_history'
      )
    order by c.relname
  loop
    raise notice '  % (kind=%): rls=% policies=%', r.table_name, r.kind, r.rls_enabled, r.policies;
  end loop;
end
$$;
