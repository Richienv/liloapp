-- ============================================================================
-- Which migrations have actually been applied?
--
-- The RLS overview answers "is this table protected". This answers "did each
-- migration run", which is a different question — a table can show RLS = true
-- because one migration enabled it while the migration that was supposed to add
-- its policies never ran.
--
-- Returns rows, so the Supabase SQL editor displays it.
--
-- Read the `status` column. Anything that is not 'OK' needs the named file run.
-- ============================================================================

-- ---------------------------------------------------------------- 1. policies
-- Every policy on the tables the migrations touch, with the command it covers.
-- `cmd` of 'ALL' on a table you expected to be read-only is the dangerous case:
-- one permissive ALL policy undoes every careful SELECT policy next to it.
select
  'policy' as check_type,
  c.relname as object_name,
  p.polname as detail,
  case p.polcmd
    when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
    when 'd' then 'DELETE' when '*' then 'ALL' else p.polcmd::text
  end as cmd,
  case when p.polpermissive then 'permissive' else 'restrictive' end as mode,
  'OK' as status
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'vouchers','voucher_usage','streamer_active_schedules','streamer_schedule',
    'accepted_bookings','booking_status_history','streamer_price_history'
  )

union all

-- ------------------------------------------------- 2. the payment unique index
-- 20260806110000_payment_idempotency.sql. Without this a repeated Midtrans
-- callback creates a second payment row and a second set of bookings.
select
  'index',
  'payments',
  'payments_transaction_id_key (unique on transaction_id)',
  '',
  '',
  case when exists (
    select 1 from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace n on n.oid = tc.relnamespace
    where n.nspname = 'public' and tc.relname = 'payments'
      and i.indisunique
      and (select array_agg(a.attname order by a.attname)
           from pg_attribute a
           where a.attrelid = tc.oid and a.attnum = any(i.indkey)) = array['transaction_id']::name[]
  ) then 'OK' else 'MISSING — run 20260806110000_payment_idempotency.sql' end

union all

-- --------------------------------------------------------- 3. the voucher RPC
-- 20260806120000_decrement_voucher_quantity.sql. Until this exists, every
-- payment silently fails to decrement stock and vouchers are unlimited.
select
  'function',
  'decrement_voucher_quantity',
  'security definer, service_role only',
  '',
  '',
  case when exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'decrement_voucher_quantity'
  ) then 'OK' else 'MISSING — run 20260806120000_decrement_voucher_quantity.sql' end

union all

-- ------------------------------------------------- 4. the ownership predicates
-- 20260806130000_lock_down_schedule_tables.sql. If these are absent the
-- schedule policies cannot be evaluating correctly.
select
  'function',
  p.proname,
  'ownership predicate',
  '',
  '',
  'OK'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('salda_owns_streamer','salda_in_booking','is_admin')

union all

-- ------------------------------------------------------------- 5. admin allowlist
-- public.is_admin() reads this. An empty table means nobody is an admin, which
-- is safe but makes the verification queue and the voucher list unusable.
select
  'data',
  'admin_users',
  count(*)::text || ' admin(s) listed',
  '',
  '',
  case when count(*) > 0 then 'OK'
       else 'EMPTY — no one can approve streamers or see inactive vouchers' end
from public.admin_users

order by 1, 2, 3;
