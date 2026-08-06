-- ============================================================================
-- Did the RLS migrations actually take?
--
-- Paste this into the Supabase SQL editor. Unlike the migrations themselves —
-- which report through `raise notice`, and the editor does not display notices —
-- this returns rows, so you can see the answer.
--
-- WHAT YOU WANT TO SEE
--
--   rls          't' on every row. 'f' means that table is still wide open.
--   policies     > 0 wherever rls is 't'. RLS on with ZERO policies is not
--                "secure", it is "returns nothing to everyone", and it looks
--                identical from the outside to RLS working correctly.
--   anon_writes  '-' on every row. Anything else means the browser key can
--                still write that table.
--
-- The `kind` column matters for accepted_bookings: 'r' means it is a real table
-- and should carry a policy; 'v' means it is a view, which cannot, and is
-- protected by security_invoker plus the RLS on `bookings` instead.
-- ============================================================================

select
  c.relname                                    as table_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned'
    when 'v' then 'view'
    when 'm' then 'matview'
    else c.relkind::text
  end                                          as kind,
  c.relrowsecurity                             as rls,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,

  -- What the browser roles can still do, straight from the grants. RLS narrows
  -- a privilege; it cannot create one, so a revoked write is refused before any
  -- policy is even consulted.
  coalesce(nullif(concat_ws('',
    case when has_table_privilege('anon', c.oid, 'SELECT') then 'S' else '' end,
    case when has_table_privilege('anon', c.oid, 'INSERT') then 'I' else '' end,
    case when has_table_privilege('anon', c.oid, 'UPDATE') then 'U' else '' end,
    case when has_table_privilege('anon', c.oid, 'DELETE') then 'D' else '' end
  ), ''), '-')                                 as anon_grants,

  coalesce(nullif(concat_ws('',
    case when has_table_privilege('anon', c.oid, 'INSERT') then 'I' else '' end,
    case when has_table_privilege('anon', c.oid, 'UPDATE') then 'U' else '' end,
    case when has_table_privilege('anon', c.oid, 'DELETE') then 'D' else '' end
  ), ''), '-')                                 as anon_writes,

  coalesce(nullif(concat_ws('',
    case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'S' else '' end,
    case when has_table_privilege('authenticated', c.oid, 'INSERT') then 'I' else '' end,
    case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'U' else '' end,
    case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'D' else '' end
  ), ''), '-')                                 as auth_grants

from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    -- this migration
    'streamer_active_schedules', 'streamer_schedule', 'accepted_bookings',
    'booking_status_history', 'streamer_price_history',
    -- the earlier ones, so you can confirm those held too
    'vouchers', 'voucher_usage', 'bookings', 'payments', 'streamers', 'users'
  )
order by
  -- unprotected first: if anything is wrong it is at the top of the result
  c.relrowsecurity, c.relname;
