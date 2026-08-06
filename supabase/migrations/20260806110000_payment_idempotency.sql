-- Migration: payment idempotency
--
-- Purpose:
--   Make `payments.transaction_id` (the Midtrans `order_id`) unique, so one
--   Midtrans order can only ever produce one payment row.
--
-- Affected objects:
--   - public.payments   (new unique index payments_transaction_id_key)
--
-- Why the database has to be the arbiter here:
--   `createBookingAfterPayment()` runs from the browser's success callback,
--   which fires more than once in normal life: a double-click on Snap's
--   confirmation, a retried fetch on a flaky mobile connection, a page reload
--   after `onSuccess`. Every one of those used to run a blind insert, so a
--   single captured payment produced two full sets of bookings and two payments
--   rows. A check-then-insert in application code cannot close that: two
--   requests can both read "no payment yet" before either writes.
--
--   The duplicate rows then wedged the webhook, which looks the payment up with
--   `.eq('transaction_id', order_id).maybeSingle()`. With two matches PostgREST
--   returns an error, the handler threw, Midtrans got a 500 — and Midtrans
--   retries a failed notification for hours. The payment never reconciled.
--
-- Special considerations:
--   - PRE-FLIGHT: the live table may ALREADY contain duplicates, and
--     `create unique index` would simply fail against them with a message that
--     names one arbitrary row. Section 1 detects that case first and stops with
--     an actionable exception instead of half-applying this migration.
--   - Re-runnable: section 1 short-circuits once the index exists, and the
--     index itself is created `if not exists`.
--   - Rows with a NULL transaction_id are left unconstrained: NULLs are
--     distinct in a Postgres unique index, so any number of them coexist. They
--     predate the Midtrans integration writing the order id and are not what
--     this guards against.
--   - The index is deliberately NOT partial (`where transaction_id is not
--     null`). A partial unique index cannot be used for `ON CONFLICT
--     (transaction_id)` inference unless the statement repeats the predicate,
--     and neither PostgREST nor supabase-js emits one — so a partial index
--     would quietly turn every future upsert into an error.
--   - Plain `create index`, not `concurrently`: migrations run inside a
--     transaction and CONCURRENTLY is not allowed there. `payments` is small
--     (one row per checkout). If it has grown enough for the brief write lock
--     to matter, run this by hand outside the migration instead:
--         create unique index concurrently payments_transaction_id_key
--           on public.payments (transaction_id);


-- ============================================================================
-- 1) PRE-FLIGHT: REFUSE ON EXISTING DUPLICATES
--
-- Fail loudly and completely rather than leaving the schema half-migrated. The
-- duplicates are real money events that need a human decision (which booking
-- set is the one the brand actually gets), so this migration must not guess.
-- ============================================================================

do $$
declare
  duplicate_groups integer;
  duplicate_rows integer;
  offenders text;
begin
  -- Already enforced? Then a previous run finished and there is nothing to
  -- check — a duplicate cannot exist under a unique index. Skipping keeps the
  -- re-run cheap on a large table.
  if exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'payments'
      and i.indisunique
      -- exactly one key column, and no partial predicate: anything else does
      -- not actually guarantee "one row per transaction_id".
      and i.indnkeyatts = 1
      and i.indpred is null
      and i.indkey[0] = (
        select a.attnum
        from pg_attribute a
        where a.attrelid = c.oid
          and a.attname = 'transaction_id'
          and not a.attisdropped
      )
  ) then
    raise notice 'payments.transaction_id is already unique; nothing to check.';
    return;
  end if;

  select
    count(*),
    coalesce(sum(duplicates.occurrences), 0)
  into duplicate_groups, duplicate_rows
  from (
    select count(*) as occurrences
    from public.payments
    where transaction_id is not null
    group by transaction_id
    having count(*) > 1
  ) as duplicates;

  if duplicate_groups > 0 then
    -- A short sample, not the whole list: the operator needs enough to start
    -- the query in section 3, not a message the size of the table.
    select string_agg(sample.transaction_id, ', ' order by sample.transaction_id)
    into offenders
    from (
      select transaction_id
      from public.payments
      where transaction_id is not null
      group by transaction_id
      having count(*) > 1
      order by transaction_id
      limit 10
    ) as sample;

    raise exception
      'Cannot make payments.transaction_id unique: % order id(s) have more than one payment row (% rows total).',
      duplicate_groups, duplicate_rows
      using
        detail = format(
          'First offending order id(s): %s. Each of these is one captured Midtrans payment that was recorded twice, so it also has a duplicate set of bookings.',
          offenders
        ),
        hint =
          'Nothing in this migration has been applied. Run the inspection query in section 3 of this file, decide which payment row (and its bookings) to keep for each order id, remove the other, then re-run this migration.';
  end if;
end;
$$;


-- ============================================================================
-- 2) THE CONSTRAINT
--
-- This is the real arbiter of "this order has already been recorded". The
-- application treats SQLSTATE 23505 from this index as "already done" rather
-- than as an error, which is what makes a duplicated callback a no-op instead
-- of a second booking.
-- ============================================================================

create unique index if not exists payments_transaction_id_key
  on public.payments (transaction_id);

comment on index public.payments_transaction_id_key is 'One payment row per Midtrans order_id. Guarantees createBookingAfterPayment() is idempotent under double-clicks, retried callbacks and page reloads, and keeps the Midtrans webhook''s single-row lookup from erroring (which used to make Midtrans retry the notification forever).';


-- ============================================================================
-- 3) CLEANUP RECIPE (for the operator, when section 1 refuses)
--
-- Everything below is commented out on purpose. Deleting a payment row is
-- destructive and irreversible, and which of two duplicates is "the real one"
-- is a business decision, not a mechanical one.
--
-- 3a. INSPECT — one line per duplicated payment row, with the bookings it owns:
--
--   select
--     p.transaction_id,
--     p.id            as payment_id,
--     p.booking_id    as anchor_booking_id,
--     p.amount,
--     p.status,
--     p.payment_status,
--     p.created_at,
--     (select count(*) from public.bookings b where b.payment_group_id = p.id) as booking_count,
--     (select array_agg(b.status) from public.bookings b where b.payment_group_id = p.id) as booking_statuses
--   from public.payments p
--   join (
--     select transaction_id
--     from public.payments
--     where transaction_id is not null
--     group by transaction_id
--     having count(*) > 1
--   ) d on d.transaction_id = p.transaction_id
--   order by p.transaction_id, p.created_at;
--
-- 3b. DECIDE. The brand paid once, so exactly one payment row per
--     transaction_id survives. Keep the OLDEST row (`min(created_at)`) unless
--     the inspection shows the streamer has already accepted or completed
--     bookings that belong to a later row — an accepted booking is real work
--     that has been scheduled, and it wins over creation order.
--
-- 3c. RESOLVE the losing rows, one transaction_id at a time, reviewing each:
--
--   -- the duplicate bookings never happened; they were never separately paid for
--   update public.bookings
--   set status = 'cancelled',
--       reason = 'Duplicate of an identical booking created by a repeated payment callback',
--       payment_group_id = null,
--       updated_at = now()
--   where payment_group_id = '<losing payment id>';
--
--   delete from public.payments where id = '<losing payment id>';
--
-- 3d. Re-run this migration. Section 1 will pass and section 2 will make the
--     situation unrepeatable.
-- ============================================================================
