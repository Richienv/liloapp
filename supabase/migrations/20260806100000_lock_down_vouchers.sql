-- Migration: lock down the voucher tables
-- Description: enables row level security on public.vouchers and revisits the
--   policies on public.voucher_usage, so that discount codes can be read at
--   checkout but written only by the service role.
-- Affected: public.vouchers      (RLS enabled, select policies, grants revoked)
--           public.voucher_usage (policies replaced, grants revoked)
-- Special considerations: apply this TOGETHER with the server actions in
--   app/admin/vouchers/actions.ts. Voucher creation used to happen in the
--   browser with the anon key; after this migration the only write path is the
--   service role, so SUPABASE_SERVICE_ROLE_KEY must be set in the environment.

-- Why this migration exists
--
-- public.vouchers shipped with RLS disabled and no policies. Supabase grants
-- `anon` and `authenticated` full DML on public tables by default, and the anon
-- key is embedded in the browser bundle — so anybody who opened devtools could
-- run:
--
--   insert into vouchers (code, description, discount_amount, total_quantity,
--                         remaining_quantity, is_active, expires_at)
--   values ('FREE01', 'mine', 100000000, 999, 999, true, '2099-01-01');
--
-- services/voucher/voucher-service.ts only checks is_active, expires_at and
-- remaining_quantity, so a self-minted code was immediately spendable against a
-- real booking. That is direct financial loss, not a theoretical one.
--
-- RLS was left off deliberately because app/admin/vouchers/page.tsx created
-- vouchers client-side. That write now lives in a service-role server action,
-- which is what makes enabling RLS safe.


-- ============================================================================
-- 1) VOUCHERS
--
-- Read is public-ish and write is closed. The same shape as public.admin_users
-- in 20260805130000: RLS on, no INSERT/UPDATE/DELETE policy at all, and the
-- privileged writer uses the service-role key, which bypasses RLS entirely.
-- ============================================================================

alter table public.vouchers enable row level security;

-- Defence in depth alongside the missing write policies. RLS already denies an
-- insert with no policy, but a future migration that flips RLS off — or adds a
-- policy that turns out to be permissive — would silently re-open the hole.
-- Without the table privilege, neither mistake is enough on its own.
revoke insert, update, delete on public.vouchers from anon, authenticated;

grant select on public.vouchers to anon, authenticated;

drop policy if exists "vouchers_select_active" on public.vouchers;
create policy "vouchers_select_active"
  on public.vouchers
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "vouchers_select_admin" on public.vouchers;
create policy "vouchers_select_admin"
  on public.vouchers
  for select
  to authenticated
  using (public.is_admin());

comment on policy "vouchers_select_active" on public.vouchers is 'Checkout validates a typed code against this table with the caller''s own session, so the row has to be readable. Scoped to is_active because that is exactly the filter services/voucher/voucher-service.ts already applies: a voucher an admin has not switched on, or has since retired, is invisible rather than merely unusable. Expired and exhausted vouchers stay readable on purpose — they cannot be spent, and hiding them would cost the user the accurate "sudah kadaluarsa" / "sudah habis" message.';
comment on policy "vouchers_select_admin" on public.vouchers is 'The admin voucher list reads every row, including inactive ones, with the admin''s own session. Requires the admin''s email to be present in public.admin_users; without a row there the list shows only active vouchers.';

-- Deliberately NO insert, update or delete policy.
--
-- Every voucher write goes through app/admin/vouchers/actions.ts, which
-- re-derives admin identity with getAdmin() and writes with the service-role
-- client from utils/supabase/admin.ts. Service role bypasses RLS, so it needs
-- no policy here — and granting one would hand the write back to whoever holds
-- the anon key, which is the exact bug this migration closes.
--
-- KNOWN LIMITATION: a select policy cannot stop enumeration. Anyone with the
-- anon key can still `select code from vouchers` and read every live code, they
-- simply cannot create one. Closing that properly means replacing the direct
-- table read at checkout with a security-definer function that takes a code and
-- returns only the resulting discount. That is a bigger change than this
-- migration, and it is the right next step.


-- ============================================================================
-- 2) VOUCHER_USAGE
--
-- This table already had RLS on with two policies from supabase/rls_policies.sql
-- ("voucher_usage_select_own", "voucher_usage_insert_own"). Both are revisited
-- here rather than left alone, because neither matched how the code actually
-- reads and writes the table:
--
--   * the INSERT policy granted a write nothing needs. The only writer is
--     services/payment/payment-service.ts, which runs server-side with the
--     service-role client. Meanwhile the policy let any signed-in user forge
--     rows: arbitrary discount_applied against a booking that is not theirs,
--     poisoning the admin analytics and the totals shown on both dashboards.
--
--   * the SELECT policy was too narrow in two directions. The admin analytics
--     screen aggregates *all* usage with the admin's own session and saw only
--     its own rows, so the dashboard was silently empty. And the streamer
--     dashboard renders a "Voucher | Rp …" badge from the usage row attached to
--     their booking, which they could never read either — user_id there is the
--     client's, not the streamer's.
-- ============================================================================

alter table public.voucher_usage enable row level security;

revoke all on public.voucher_usage from anon;
revoke insert, update, delete on public.voucher_usage from authenticated;

grant select on public.voucher_usage to authenticated;

drop policy if exists "voucher_usage_select_own" on public.voucher_usage;
create policy "voucher_usage_select_own"
  on public.voucher_usage
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "voucher_usage_select_streamer" on public.voucher_usage;
create policy "voucher_usage_select_streamer"
  on public.voucher_usage
  for select
  to authenticated
  using (
    booking_id in (
      select bookings.id
      from public.bookings
      where bookings.streamer_id in (
        select streamers.id
        from public.streamers
        where streamers.user_id = auth.uid()
      )
    )
  );

drop policy if exists "voucher_usage_select_admin" on public.voucher_usage;
create policy "voucher_usage_select_admin"
  on public.voucher_usage
  for select
  to authenticated
  using (public.is_admin());

-- Dropped, not replaced: see the note above. Nothing in the application inserts
-- here with a user session any more.
drop policy if exists "voucher_usage_insert_own" on public.voucher_usage;

comment on policy "voucher_usage_select_own" on public.voucher_usage is 'A client reads the usage rows recorded against their own bookings, which is what /client-bookings uses to show the discounted total.';
comment on policy "voucher_usage_select_streamer" on public.voucher_usage is 'A streamer reads the usage row attached to a booking on their own profile. They already see the booking and its price; this only tells them the discount that produced it, which is what the streamer dashboard badge displays.';
comment on policy "voucher_usage_select_admin" on public.voucher_usage is 'Admins read every usage row — the voucher analytics screen aggregates across all of them and is empty without this.';

-- Deliberately no insert, update or delete policy: voucher_usage is the audit
-- trail for money that was discounted. It is written only by
-- services/payment/payment-service.ts with the service-role client, and nobody
-- should be able to edit or erase a redemption after the fact.
