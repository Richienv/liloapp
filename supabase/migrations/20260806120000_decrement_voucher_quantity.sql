-- ============================================================================
-- Define public.decrement_voucher_quantity.
--
-- WHY THIS EXISTS
--
-- services/payment/payment-service.ts has been calling
-- `rpc('decrement_voucher_quantity', { voucher_uuid })` on every successful
-- payment that used a voucher. No migration in this repository has ever
-- defined that function. Every call has failed with PGRST202/42883, the call
-- site swallows it (correctly — the money is already captured and the booking
-- must stand), and the result is that `remaining_quantity` has never gone
-- down. A voucher with `total_quantity = 50` can be redeemed without limit.
--
-- A second name, `decrement_voucher_quantity_safe`, was called from
-- services/voucher/voucher-service.ts. That call site is gone (it was a
-- browser-side write to a financial table with zero callers), so there is now
-- exactly one name to define.
--
-- WHY security definer
--
-- 20260806100000_lock_down_vouchers.sql enables RLS on public.vouchers and
-- deliberately creates no UPDATE policy — nothing holding a user session may
-- write a voucher. This function is the single sanctioned exception, so it has
-- to run as its owner to get past that. `search_path` is pinned so the body
-- cannot be redirected at a table of the caller's choosing, which is the
-- standard failure mode of a definer function.
--
-- EXECUTE is granted to service_role only. The payment service already uses
-- the service-role client, and a session-callable decrement would be a
-- griefing vector: any signed-in user could burn a live voucher's stock to
-- zero in a loop without ever paying for anything.
--
-- Idempotent. Safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pre-flight. The column names below are read from the application code
--    rather than from a schema definition in this repo, so fail loudly and
--    specifically rather than creating a function that errors at 3am.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vouchers'
  ) then
    raise exception
      'public.vouchers does not exist. Create the vouchers table before applying this migration.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vouchers'
      and column_name = 'remaining_quantity'
  ) then
    raise exception
      'public.vouchers has no remaining_quantity column. The application '
      '(services/payment/payment-service.ts, services/voucher/voucher-service.ts '
      'and app/api/payments/create/route.ts) reads and decrements that column; '
      'reconcile the schema before applying this migration.';
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. The function.
--
--    The `remaining_quantity > 0` predicate is the whole point: it is evaluated
--    against the row version this statement locks, so two concurrent callbacks
--    for the last remaining unit serialise, and the second one matches no row
--    rather than writing -1. A read-then-write in application code cannot make
--    that guarantee, which is why this is an RPC and not two queries.
--
--    Returns the new remaining count, or NULL when nothing was decremented
--    (voucher gone, or already exhausted). The caller ignores the value and
--    only checks for an error, which is deliberate — see below.
-- ----------------------------------------------------------------------------
create or replace function public.decrement_voucher_quantity(voucher_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_remaining integer;
begin
  update public.vouchers
  set remaining_quantity = remaining_quantity - 1
  where id = voucher_uuid
    and remaining_quantity > 0
  returning remaining_quantity into new_remaining;

  if new_remaining is null then
    -- Not an exception, on purpose. By the time this runs the customer has
    -- been charged and the booking exists; raising here would turn a stock
    -- accounting discrepancy into a [RECONCILE] error on a payment that
    -- actually succeeded. Over-redemption is prevented at validation time in
    -- app/api/payments/create/route.ts — this is the second line, and its job
    -- is to leave a trace, not to fail the payment.
    raise warning
      'decrement_voucher_quantity: voucher % was not decremented (missing, or remaining_quantity already 0)',
      voucher_uuid;
  end if;

  return new_remaining;
end;
$$;

comment on function public.decrement_voucher_quantity(uuid) is
  'Atomically decrement vouchers.remaining_quantity, never below zero. Called '
  'by services/payment/payment-service.ts with the service-role client after a '
  'payment settles. Returns the new remaining count, or NULL if nothing was '
  'decremented. security definer because RLS grants no UPDATE on vouchers.';

-- ----------------------------------------------------------------------------
-- 3. Who may call it.
--
--    `revoke from public` first: create function grants EXECUTE to PUBLIC by
--    default, so without this the anon role could call it the moment the
--    function exists.
-- ----------------------------------------------------------------------------
revoke all on function public.decrement_voucher_quantity(uuid) from public;
revoke all on function public.decrement_voucher_quantity(uuid) from anon;
revoke all on function public.decrement_voucher_quantity(uuid) from authenticated;
grant execute on function public.decrement_voucher_quantity(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Retire the other name if a database somewhere grew one.
--
--    Nothing in the codebase calls `decrement_voucher_quantity_safe` any more.
--    Dropped only if present, and only the exact single-uuid-argument
--    signature, so this cannot take an unrelated overload with it.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'decrement_voucher_quantity_safe'
      and pg_get_function_identity_arguments(p.oid) = 'p_voucher_id uuid'
  ) then
    drop function public.decrement_voucher_quantity_safe(p_voucher_id uuid);
    raise notice 'Dropped the now-unreferenced decrement_voucher_quantity_safe(uuid).';
  end if;
end
$$;
