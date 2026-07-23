-- ============================================================================
-- Row Level Security (RLS) policies for the currently-unprotected tables.
--
-- WHY: the app uses the public anon key in the browser, so any table WITHOUT
-- RLS is world-readable/writable by anyone who has that key. The tables below
-- were found with RLS OFF: bookings, payments, notifications, conversations,
-- messages, streamer_ratings, voucher_usage, vouchers.
--
-- PREREQUISITE (already deployed): the trusted server-side writers that have no
-- logged-in user — the Midtrans webhook (app/api/payment-webhook) and booking
-- creation (services/payment/payment-service.createBookingAfterPayment) — now
-- use the SERVICE-ROLE client (utils/supabase/admin.ts), which BYPASSES RLS.
-- So enabling RLS here does NOT break payment/booking creation. Make sure
-- SUPABASE_SERVICE_ROLE_KEY is set in the environment (it is, in Vercel).
--
-- HOW TO APPLY — do NOT run this whole file at once. Apply and TEST one table
-- at a time, in this order, in the Supabase SQL editor:
--   1) notifications  2) bookings  3) payments  4) conversations  5) messages
--   6) voucher_usage  7) streamer_ratings  8) vouchers (LAST — see caveat)
-- After each, exercise the matching flow on the app (see the checklist at the
-- bottom). If anything breaks, roll that ONE table back instantly with:
--       ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
--
-- VERIFY BEFORE RUNNING: column names below are inferred from the app code and
-- the schema references (supabase/SCHEMA_REFERENCE.md, notifications_reference
-- .sql). Confirm they match the live schema — especially:
--   - payments.booking_id (int -> bookings.id)
--   - streamer_ratings owner column (see its section)
--
-- Helper idiom used throughout:
--   streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
--   == "the current user owns this streamer profile".
-- ============================================================================


-- ============================================================================
-- 1) NOTIFICATIONS  (user_id uuid, streamer_id int)
--    Policies already existed but RLS was OFF, so they weren't enforced.
--    Read = only your own; insert = permissive (the webhook, server actions and
--    client-side message-service all create notifications for OTHER users).
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update read status of their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update is_read status of their own notifications" ON notifications;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (
  auth.uid() = user_id
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
);

-- Cross-user inserts are required (you notify the OTHER party). Kept permissive;
-- notifications are low-sensitivity to create. Reads above stay locked down.
CREATE POLICY "notifications_insert_any" ON notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (
  auth.uid() = user_id
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
) WITH CHECK (
  auth.uid() = user_id
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
);


-- ============================================================================
-- 2) BOOKINGS  (client_id uuid, streamer_id int)
--    Read/update by the client who owns it or the streamer it's for.
--    No INSERT/DELETE policy: bookings are created server-side (service-role
--    bypasses RLS), so the public key cannot forge bookings.
-- ============================================================================
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookings_select_own" ON bookings FOR SELECT USING (
  client_id = auth.uid()
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
);

-- Streamer actions (accept/reject/end/reschedule) and client cancel/reschedule
-- run with the user's session and update their own bookings.
CREATE POLICY "bookings_update_own" ON bookings FOR UPDATE USING (
  client_id = auth.uid()
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
) WITH CHECK (
  client_id = auth.uid()
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
);


-- ============================================================================
-- 3) PAYMENTS  (booking_id int -> bookings.id)
--    Read only if you own the linked booking. All writes are server-side
--    (service-role), so no INSERT/UPDATE policy is granted to end users.
-- ============================================================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select_own" ON payments FOR SELECT USING (
  booking_id IN (
    SELECT id FROM bookings
    WHERE client_id = auth.uid()
       OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
  )
);


-- ============================================================================
-- 4) CONVERSATIONS  (client_id uuid, streamer_id int)
--    Only the two participants can see or create a conversation.
-- ============================================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_participant" ON conversations FOR SELECT USING (
  client_id = auth.uid()
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
);

CREATE POLICY "conversations_insert_participant" ON conversations FOR INSERT WITH CHECK (
  client_id = auth.uid()
  OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
);


-- ============================================================================
-- 5) MESSAGES  (conversation_id uuid, sender_id uuid)
--    Read if you're a participant in the conversation; send only AS yourself
--    and only into a conversation you're part of.
-- ============================================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_participant" ON messages FOR SELECT USING (
  conversation_id IN (
    SELECT id FROM conversations
    WHERE client_id = auth.uid()
       OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
  )
);

CREATE POLICY "messages_insert_sender" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND conversation_id IN (
    SELECT id FROM conversations
    WHERE client_id = auth.uid()
       OR streamer_id IN (SELECT id FROM streamers WHERE user_id = auth.uid())
  )
);


-- ============================================================================
-- 6) VOUCHER_USAGE  (user_id uuid)
--    Users see/create only their own usage rows. The server-side booking flow
--    also inserts here, but via service-role (bypasses RLS).
--    CAVEAT: the admin vouchers analytics reads ALL usage client-side; under
--    this policy those admin reads return only the admin's own rows. Move admin
--    analytics to a service-role server action if you need the global view.
-- ============================================================================
ALTER TABLE voucher_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voucher_usage_select_own" ON voucher_usage FOR SELECT USING (
  user_id = auth.uid()
);

CREATE POLICY "voucher_usage_insert_own" ON voucher_usage FOR INSERT WITH CHECK (
  user_id = auth.uid()
);


-- ============================================================================
-- 7) STREAMER_RATINGS  (streamer_id int, rating, ...)
--    Ratings are public (shown on profiles), so SELECT is open. Insert requires
--    a logged-in user.
--    VERIFY: if this table has a client/user owner column (e.g. client_id),
--    tighten the INSERT check to `<owner_col> = auth.uid()`.
-- ============================================================================
ALTER TABLE streamer_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "streamer_ratings_select_all" ON streamer_ratings FOR SELECT USING (true);

CREATE POLICY "streamer_ratings_insert_authenticated" ON streamer_ratings FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);


-- ============================================================================
-- 8) VOUCHERS  (voucher codes)  ← APPLY LAST
--    Authenticated users must read vouchers to validate a code at checkout.
--    Admin voucher CRUD currently happens CLIENT-SIDE in app/admin/vouchers —
--    under this policy those inserts/updates will FAIL. Do NOT grant a
--    permissive write policy here (it would let any user mint 100%-off codes).
--    Instead, move voucher create/update into a service-role server action
--    (admin-gated) BEFORE enabling RLS on this table.
-- ============================================================================
-- ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "vouchers_select_authenticated" ON vouchers FOR SELECT USING (
--   auth.uid() IS NOT NULL
-- );
-- (left commented — enable only after admin voucher management is server-side)


-- ============================================================================
-- POST-APPLY TEST CHECKLIST (run the matching flow after enabling each table):
--   notifications  -> open the app: you see only YOUR notifications; a booking
--                     still generates them (webhook/actions).
--   bookings       -> client sees only their bookings; streamer sees only
--                     theirs; accept/reject/cancel still work; a paid booking is
--                     created (service-role).
--   payments       -> client sees their payment; a new payment records fine.
--   conversations/messages -> you see only your threads; sending a message works.
--   voucher_usage  -> applying a voucher at checkout still records usage.
--   streamer_ratings -> ratings show on profiles; you can submit a rating.
-- Roll back any single table with: ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
-- ============================================================================
