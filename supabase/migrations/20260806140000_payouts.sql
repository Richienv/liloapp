-- ============================================================================
-- Payouts: what a host has earned, what they can withdraw, and the request.
--
-- WHY THIS DOES NOT EXIST YET
--
-- `streamer_payout_accounts` was added months ago and the host onboarding fills
-- it in — a bank, an account number, a holder name. Nothing has ever paid into
-- it. There is no ledger, no balance, and no way for a host to ask for their
-- money. The dashboard sections that show "Uang yang bisa kamu ambil sekarang",
-- "Riwayat pembayaran" and "Dari mana uangnya bulan ini" have nothing to read.
--
-- THE MODEL
--
-- Earnings are DERIVED from bookings, not stored. A stored balance is a second
-- source of truth that drifts the first time a booking is cancelled after the
-- balance was incremented, and reconciling it means auditing money by hand.
-- The only rows this migration stores are the withdrawals themselves, which are
-- facts about something that happened rather than a running total.
--
--   held      accepted / live bookings whose end_time has not passed.
--             The brand has paid; the host has not finished the work.
--   available completed bookings, minus everything already withdrawn or in
--             flight. This is the number on the "Tarik saldo" button.
--   withdrawn payouts that have been paid out.
--
--   available = completed_earnings - (paid + pending + processing payouts)
--
-- Pending and processing payouts are subtracted deliberately: a host who taps
-- withdraw twice in four seconds must not be able to request the same money
-- twice, and the second tap should see a balance that already reflects the
-- first.
--
-- WHAT A HOST EARNS
--
-- `bookings.price` is what the BRAND paid — base x 1.3 platform fee, x 1.443
-- with tax. The host receives the base underneath it. Every figure below runs
-- through `salda_host_earnings()` so that division happens in exactly one place;
-- the dashboard chart already got this wrong once by charting the raw price and
-- over-reporting a host's earnings by ~44%.
--
-- Idempotent. Safe to run more than once.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. What the host receives from a booking.
--
--    Mirrors lib/pricing.ts. TOTAL_MULTIPLIER there is 1.443 (1.3 platform fee
--    x 1.11 tax), so the host's share is the brand's payment divided by it.
--
--    Kept as its own function rather than inlined so that when the fee model
--    changes there is one place to change it, and so the number the database
--    reports can be diffed against the number the app computes.
-- ----------------------------------------------------------------------------
create or replace function public.salda_host_earnings(brand_paid numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  -- round, not floor: floor would quietly shave a rupiah off most sessions, and
  -- across a year of bookings that is a real number the host never sees.
  select greatest(round(coalesce(brand_paid, 0) / 1.443), 0)::bigint;
$$;

comment on function public.salda_host_earnings(numeric) is
  'The host share of what a brand paid for a booking. bookings.price includes the 30% platform fee and 11% tax (lib/pricing.ts TOTAL_MULTIPLIER = 1.443); this divides it back out. One definition so no caller re-derives it.';


-- ----------------------------------------------------------------------------
-- 2. The withdrawals ledger.
--
--    A row per request. Never updated except to move `status` forward, which is
--    why there is no `updated_at` — `processed_at` is the only transition that
--    matters and it is its own column.
-- ----------------------------------------------------------------------------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  streamer_id bigint not null references public.streamers (id) on delete cascade,

  -- Rupiah, whole. Indonesia has no minor unit in circulation, and a float here
  -- would eventually pay somebody 449999.99999.
  amount bigint not null check (amount > 0),

  -- pending    the host asked, nobody has looked yet
  -- processing finance has picked it up, the transfer is out
  -- paid       money has landed
  -- rejected   refused, `note` says why
  -- cancelled  the host withdrew the request before it was processed
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'rejected', 'cancelled')),

  -- Which account it went to. `on delete restrict`, not cascade: deleting a bank
  -- account must never silently erase the record of money sent to it.
  payout_account_id uuid references public.streamer_payout_accounts (id) on delete restrict,

  -- Denormalised at request time. If the host later edits their bank details,
  -- the historical row must still say where the money actually went.
  bank_name text,
  account_number_masked text,

  note text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.payouts is
  'Withdrawal requests and their outcome. The only stored money rows — balances are derived from bookings, never stored, so a cancelled booking cannot leave a stale total behind.';
comment on column public.payouts.amount is 'Whole rupiah. The host share, already net of the platform fee and tax.';
comment on column public.payouts.account_number_masked is 'Masked at request time. Historical rows must survive the host editing their bank details.';

create index if not exists idx_payouts_streamer on public.payouts (streamer_id, requested_at desc);
create index if not exists idx_payouts_open on public.payouts (streamer_id) where status in ('pending', 'processing');


-- ----------------------------------------------------------------------------
-- 3. The balance.
--
--    security definer so a host gets their own figures without needing SELECT
--    on `bookings` — and, more importantly, so the arithmetic cannot be
--    reproduced client-side with a different definition of "completed".
-- ----------------------------------------------------------------------------
create or replace function public.salda_streamer_balance(target_streamer bigint)
returns table (
  held bigint,
  available bigint,
  withdrawn bigint,
  lifetime bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with earned as (
    select
      coalesce(sum(public.salda_host_earnings(b.price))
        filter (where b.status = 'completed'), 0)::bigint as completed,
      coalesce(sum(public.salda_host_earnings(b.price))
        filter (where b.status in ('accepted', 'live')), 0)::bigint as in_flight
    from public.bookings b
    where b.streamer_id = target_streamer
  ),
  paid_out as (
    select
      coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)::bigint as settled,
      -- pending and processing are subtracted from `available` so a second
      -- withdraw tap cannot request money the first one already claimed.
      coalesce(sum(p.amount) filter (where p.status in ('pending', 'processing')), 0)::bigint as claimed
    from public.payouts p
    where p.streamer_id = target_streamer
  )
  select
    earned.in_flight,
    -- greatest(...,0): if an admin marks a payout paid for more than was ever
    -- earned, the host is shown zero rather than a negative balance they cannot
    -- act on. The discrepancy belongs in a reconciliation report, not here.
    greatest(earned.completed - paid_out.settled - paid_out.claimed, 0),
    paid_out.settled,
    earned.completed
  from earned, paid_out;
$$;

comment on function public.salda_streamer_balance(bigint) is
  'held / available / withdrawn / lifetime for one host, in whole rupiah, net of the platform fee. Derived from bookings and payouts — nothing is stored.';

revoke all on function public.salda_streamer_balance(bigint) from public;
grant execute on function public.salda_streamer_balance(bigint) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. Requesting a withdrawal.
--
--    A function rather than an INSERT policy, because the amount has to be
--    checked against a balance the client must not be trusted to compute, and
--    because the account snapshot has to be taken server-side.
-- ----------------------------------------------------------------------------
create or replace function public.salda_request_payout(target_streamer bigint, requested bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  bal record;
  acct record;
  new_id uuid;
begin
  -- Ownership is checked HERE, not by a policy: this is `security definer`, so
  -- RLS does not apply to what it does. Without this any authenticated user
  -- could withdraw from any host.
  if not exists (
    select 1 from public.streamers s
    where s.id = target_streamer and s.user_id = auth.uid()
  ) then
    raise exception 'Kamu tidak bisa menarik saldo host lain.' using errcode = '42501';
  end if;

  if requested is null or requested <= 0 then
    raise exception 'Jumlah penarikan harus lebih dari nol.' using errcode = '22023';
  end if;

  -- Serialise concurrent withdrawals by locking the STREAMER row.
  --
  -- The obvious version of this locks the host's open payouts:
  --
  --   perform 1 from public.payouts
  --    where streamer_id = target_streamer and status in ('pending','processing')
  --    for update;
  --
  -- which does nothing at all, because a host with no open payouts has no rows
  -- to lock. Two taps four seconds apart then both read the same balance and
  -- both insert. Reproduced against PostgreSQL 16: two concurrent requests for
  -- 600.000 against a 1.000.000 balance BOTH succeeded, committing 1.200.000.
  --
  -- The streamers row always exists — ownership was just checked against it —
  -- so it is something to contend on. The second caller blocks here, then reads
  -- a balance that already reflects the first request.
  perform 1 from public.streamers where id = target_streamer for update;

  select * into bal from public.salda_streamer_balance(target_streamer);

  if requested > bal.available then
    raise exception 'Saldo yang bisa dicairkan hanya Rp %.', bal.available
      using errcode = '23514';
  end if;

  select * into acct
  from public.streamer_payout_accounts a
  where a.streamer_id = target_streamer
  order by a.is_primary desc, a.created_at asc
  limit 1;

  if acct.id is null then
    raise exception 'Belum ada rekening tujuan. Tambahkan rekening dulu di pengaturan.'
      using errcode = '23502';
  end if;

  insert into public.payouts (
    streamer_id, amount, payout_account_id, bank_name, account_number_masked
  )
  values (
    target_streamer,
    requested,
    acct.id,
    acct.bank_name,
    -- Only the last four digits are ever shown, and only the last four are
    -- stored on this row. A payout history is not a place to keep a second copy
    -- of a bank account number.
    '••' || right(acct.account_number, 4)
  )
  returning id into new_id;

  return new_id;
end;
$$;

comment on function public.salda_request_payout(bigint, bigint) is
  'Create a withdrawal request after verifying the caller owns the host and the amount is within their available balance. Snapshots the destination account so history survives the host editing their bank details.';

revoke all on function public.salda_request_payout(bigint, bigint) from public;
grant execute on function public.salda_request_payout(bigint, bigint) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5. RLS.
--
--    A host reads their own payouts and cannot write any of them — every write
--    goes through salda_request_payout, which is the only thing that checks the
--    balance. An INSERT policy here would let a host insert a row for any
--    amount they liked.
-- ----------------------------------------------------------------------------
alter table public.payouts enable row level security;

revoke all on public.payouts from anon;
revoke all on public.payouts from authenticated;
grant select on public.payouts to authenticated;

drop policy if exists "payouts_select_own" on public.payouts;
create policy "payouts_select_own" on public.payouts
  for select to authenticated
  using (
    public.salda_owns_streamer(streamer_id)
    or public.is_admin()
  );

do $$
begin
  raise notice 'payouts: table + balance + request function ready. RLS on, read-only for hosts, writes only via salda_request_payout().';
end
$$;
