Database Documentation

This documentation describes the database structure for a web application that facilitates booking livestreamers for TikTok and Shopee Live to help businesses sell products through live streams. The application also integrates Midtrans for payment processing.

THE BOOKABILITY RULE — read this first

A streamer is publicly listed and bookable only when:

	is_active = true AND verification_status = 'approved'

Every public query — the marketplace listing, the `/location/<slug>` city pages, `sitemap.xml`, and the `/[username]` profile page — MUST apply both conditions. `is_active` is the streamer's own on/off switch; `verification_status` is Salda's trust decision, and only an admin can change it. Neither one alone is sufficient.

ACCOUNT-FIRST SIGNUP — why half-filled rows are normal

Since migration `20260806000000`, an account exists before a role is chosen and a streamer row exists before the profile is finished. Two consequences that surprise people reading a row:

	•	`users.user_type` can be NULL. It means "account created, role picker not answered yet". `lib/auth-redirect.ts` routes those accounts to `/pilih-peran`.
	•	A `streamers` row can be missing `platform`, `category`, `price`, `image_url` and `rating`. Those columns were relaxed to nullable so a profile can be completed across the three milestones in `lib/milestones.ts` instead of in one 19-field transaction.

Relaxing them widened what can be STORED, never what can be SEEN: a row created by the role picker starts at `verification_status = 'pending'` (the column default, re-forced by `trg_force_streamer_pending_on_insert`), so the bookability rule above keeps an unfinished profile out of every public surface no matter how empty it is. Any new code that reads a streamer row must therefore treat those columns as possibly NULL. The existing CHECK constraints are unaffected — a CHECK that evaluates to NULL passes, so `price >= 0` still rejects a negative price while accepting no price at all.

Tables Overview

1. Streamers

Stores information about livestreamers, including their associated details.
	•	Columns:
	•	id (bigint): Unique identifier for the livestreamer.
	•	user_id (UUID): Reference to the corresponding user in the users table.
	•	username (text): Public profile slug. This is the whole public SEO surface: the `/[username]` route, the canonical URL in structured data, and the sitemap entry. Unique CASE-INSENSITIVELY via the `streamers_username_lower_key` index on `lower(username)` — a duplicate insert fails with SQLSTATE 23505 naming that index. Nullable in the database only so a deploy cannot break in-flight inserts; signup always writes one. Generated and validated by `lib/username.ts`.
	•	first_name (text): Livestreamer’s first name.
	•	last_name (text): Livestreamer’s last name.
	•	platform (text, NULLABLE): The platform where the livestreamer operates (e.g., TikTok, Shopee). Collected during the “publish” milestone, so NULL until setup reaches it.
	•	category (text, NULLABLE): Category of products/services the streamer specializes in. Collected during the “publish” milestone.
	•	price (numeric, NULLABLE): Hourly rate of the livestreamer. Collected during the “publish” milestone; `check (price >= 0)` still applies to any value that is present.
	•	image_url (text, NULLABLE): URL to the livestreamer’s profile image. Collected during the “publish” milestone.
	•	bio (text): Description or biography of the livestreamer.
	•	location (text): Free-text location as typed at signup. LEGACY — kept for display and old reads; filter on `city_slug` instead.
	•	city_slug (text): Canonical city slug from the 30-city registry in `lib/cities.ts`. Powers `/location/<slug>` SEO pages and shipping logistics. Backfilled best-effort from `location`; NULL when the legacy text matched no city. Indexed (`idx_streamers_city_slug`).
	•	full_address (text): Detailed address of the livestreamer.
	•	video_url (text): URL to a sample video or livestream demo.
	•	rating (numeric, NULLABLE): Average rating given to the livestreamer. NULL for a streamer nobody has rated yet — which, since account-first signup, includes every brand-new profile.
	•	profile_published_at (timestamptz): When this profile FIRST carried every field a listing needs (the “publish” milestone in `lib/milestones.ts`). Stamped once by the `trg_stamp_streamer_published_at` trigger and never cleared, so it survives the streamer later blanking a field. It is an observation, NOT a visibility switch — visibility is still the bookability rule at the top of this document. NULL means the profile has never been complete. Rows that predate the revamp were backfilled from `created_at`, since the old one-shot form could not produce an incomplete row. Partially indexed (`idx_streamers_unpublished`, WHERE profile_published_at IS NULL) to find hosts who never finished.
	•	is_active (boolean, not null, default true): The streamer’s own availability switch. False hides the profile from search and booking without deleting it.
	•	verification_status (text, not null, default 'pending'): One of 'pending' | 'approved' | 'rejected' | 'suspended', enforced by `streamers_verification_status_check`. New signups start 'pending'. Every streamer that existed before this column was introduced was grandfathered to 'approved' so nobody who was bookable stopped being bookable. Indexed (`idx_streamers_verification_status`).
	•	verified_at (timestamptz): When the streamer reached 'approved'.
	•	verified_by (UUID): The admin (auth.users.id) who approved them. NULL for grandfathered rows — no human actually reviewed those.
	•	Indexed on `user_id` (`idx_streamers_user_id`): every authenticated page load resolves “which streamer row is mine?” from the signed-in user id.
	•	NOTE: `rejection_reason` was DROPPED by migration `20260805140000`. This table is world-readable through the anon key, so an admin’s private assessment of a named person cannot live here. Read the note from `streamer_verification_submissions.notes` instead, which is RLS-protected.

2. Users

Contains details of all users, including business owners and livestreamers.
	•	Columns:
	•	id (UUID): Unique identifier for the user.
	•	email (text): User’s email address.
	•	first_name (text): User’s first name.
	•	last_name (text): User’s last name.
	•	user_type (text, NULLABLE): What this person came here to do — 'client' (brand) or 'streamer' (host). NULL means the account exists but the role picker has not been answered yet; `nextPathFor()` in `lib/auth-redirect.ts` sends those accounts to `/pilih-peran`. Nullable since the account-first revamp; every row that predates it already carries a role. There is no 'admin' value — see “Admin access” at the end of this document. Accounts still awaiting a role are found via the partial index `idx_users_awaiting_role`.
	•	role_selected_at (timestamptz): When the role picker was answered. Separate from `created_at` so the gap between “account exists” and “role chosen” is measurable. NULL on rows that predate the column even though they have a `user_type` — we do not know when they chose, and back-dating it would fabricate funnel data.
	•	profile_picture_url (text): URL to the user’s profile picture.
	•	bio (text): Short biography of the user.
	•	brand_name (text): Name of the client’s brand, if applicable.
	•	brand_guidelines_url (text): URL to the client’s brand guidelines.
	•	location (text): Free-text location. LEGACY — prefer `city_slug`.
	•	city_slug (text): Canonical city slug from `lib/cities.ts`. Backfilled best-effort from `location`.
	•	phone (text): Contact number in E.164 format (+628…), normalized by `lib/phone.ts`. This is the WhatsApp channel brands and streamers actually use to reach each other.
	•	phone_verified (boolean, not null, default false): True once the number has passed OTP verification. Every pre-existing row is false — nobody had been verified when the column shipped.
	•	created_at (timestamp): Timestamp when the user was created.
	•	updated_at (timestamp): Timestamp when the user’s details were last updated.
	•	brand_name_updated_at (timestamp): Timestamp when the brand name was last updated.

3. Testimonials

Stores testimonials and ratings provided by clients for livestreamers.
	•	Columns:
	•	id (UUID): Unique identifier for the testimonial.
	•	streamer_id (bigint): Foreign key referencing the streamers table.
	•	client_name (text): Name of the client who provided the testimonial.
	•	comment (text): Feedback from the client.
	•	rating (integer): Rating given to the livestreamer (e.g., 1-5).
	•	created_at (timestamp): Timestamp when the testimonial was created.

4. Webhook Logs

Tracks webhook events and logs for integrations, such as payment processing.
	•	Columns:
	•	id (bigint): Unique identifier for the webhook log.
	•	source (text): Source of the webhook event.
	•	payload (JSON): Detailed payload data of the webhook.
	•	processed (boolean): Indicates if the webhook has been processed.
	•	error_message (text): Error message, if applicable.
	•	created_at (timestamp): Timestamp when the webhook was logged.

5. Streamer Schedule

Manages availability and schedules of livestreamers.
	•	Columns:
	•	id (UUID): Unique identifier for the schedule.
	•	streamer_id (integer): Foreign key referencing the streamers table.
	•	day_of_week (integer): Day of the week (0 = Sunday, 6 = Saturday).
	•	start_time (time): Start time of the livestreamer’s availability.
	•	end_time (time): End time of the livestreamer’s availability.
	•	is_available (boolean): Indicates whether the livestreamer is available during the specified time.
	•	created_at (timestamp): Timestamp when the schedule was created.
	•	updated_at (timestamp): Timestamp when the schedule was last updated.

Relationships
	1.	Streamers ↔ Users: streamers.user_id is a foreign key referencing users.id.
	2.	Testimonials ↔ Streamers: testimonials.streamer_id is a foreign key referencing streamers.id.
	3.	Streamer Schedule ↔ Streamers: streamer_schedule.streamer_id is a foreign key referencing streamers.id.

6. Streamer Ratings

Stores individual ratings for livestreamers to calculate the average rating and track feedback.
	•	Columns:
	•	id (bigint): Unique identifier for the rating.
	•	streamer_id (bigint): Foreign key referencing the streamers table.
	•	rating (integer): Rating value (e.g., 1-5).
	•	created_at (timestamp): Timestamp when the rating was recorded.

7. Streamer Gallery Photos

Stores photos associated with livestreamers for their gallery or portfolio.
	•	Columns:
	•	id (UUID): Unique identifier for the photo entry.
	•	streamer_id (bigint): Foreign key referencing the streamers table.
	•	photo_url (text): URL of the photo.
	•	order_number (integer): The display order of the photo in the gallery.
	•	caption (text): Optional caption or description for the photo.
	•	created_at (timestamp): Timestamp when the photo was added.
	•	updated_at (timestamp): Timestamp when the photo entry was last updated.

8. Streamer Day Offs

Manages the unavailability of livestreamers by specifying their days off.
	•	Columns:
	•	id (UUID): Unique identifier for the day-off record.
	•	streamer_id (integer): Foreign key referencing the streamers table.
	•	date (date): The date the streamer is unavailable.
	•	created_at (timestamp): Timestamp when the day-off record was created.
	•	updated_at (timestamp): Timestamp when the day-off record was last updated.

9. Streamer Active Schedules

Stores active schedules for livestreamers in a structured JSON format.
	•	Columns:
	•	id (UUID): Unique identifier for the active schedule record.
	•	streamer_id (integer): Foreign key referencing the streamers table.
	•	schedule (JSONB): JSON object storing detailed active schedule information.
	•	created_at (timestamp): Timestamp when the schedule was created.
	•	updated_at (timestamp): Timestamp when the schedule was last updated.

10. Payments

Manages payment transactions for bookings, integrating with Midtrans.
	•	Columns:
	•	id (UUID): Unique identifier for the payment.
	•	booking_id (integer): Foreign key referencing the booking record (not shown in this schema).
	•	amount (numeric): Total amount paid.
	•	payment_method (text): Method of payment used (e.g., credit card, bank transfer).
	•	status (text): Current payment status (e.g., pending, completed, failed).
	•	transaction_id (text): Unique identifier for the transaction (provided by Midtrans).
	•	payment_token (text): Token for the payment session.
	•	payment_url (text): URL for the payment page.
	•	payment_status (text): Final status of the payment (e.g., success, failed).
	•	midtrans_response (JSONB): Response payload from Midtrans.
	•	payment_method_detail (JSONB): Detailed information about the payment method used.
	•	expiry_time (timestamp): Expiry time of the payment session.
	•	created_at (timestamp): Timestamp when the payment record was created.
	•	updated_at (timestamp): Timestamp when the payment record was last updated.

11. Payment Status History

Tracks the status change history of payments for auditing and troubleshooting.
	•	Columns:
	•	id (bigint): Unique identifier for the status history record.
	•	payment_id (UUID): Foreign key referencing the payments table.
	•	previous_status (text): The payment status before the update.
	•	new_status (text): The updated payment status.
	•	midtrans_notification (JSONB): Notification payload from Midtrans regarding the status change.
	•	created_at (timestamp): Timestamp when the status update was recorded.

12. Notifications

Manages notifications sent to users about updates and alerts.
	•	Columns:
	•	id (UUID): Unique identifier for the notification.
	•	user_id (UUID): Foreign key referencing the users table.
	•	message (text): Notification content.
	•	type (text): Type of notification (e.g., system, booking-related).
	•	is_read (boolean): Indicates if the notification has been read.
	•	streamer_id (bigint): Foreign key referencing the streamers table (optional).
	•	booking_id (bigint): Foreign key referencing the bookings table (optional).
	•	created_at (timestamp): Timestamp when the notification was created.

13. Messages

Stores messages exchanged between clients and streamers.
	•	Columns:
	•	id (UUID): Unique identifier for the message.
	•	conversation_id (UUID): Foreign key referencing the conversations table.
	•	sender_id (UUID): Foreign key referencing the users table.
	•	content (text): Message content.
	•	message_type (text): Type of message (e.g., text, media).
	•	is_read (boolean): Indicates if the message has been read.
	•	created_at (timestamp): Timestamp when the message was sent.

14. Conversations

Manages chat conversations between clients and livestreamers.
	•	Columns:
	•	id (UUID): Unique identifier for the conversation.
	•	streamer_id (bigint): Foreign key referencing the streamers table.
	•	client_id (UUID): Foreign key referencing the users table (user type = client).
	•	created_at (timestamp): Timestamp when the conversation was created.
	•	updated_at (timestamp): Timestamp when the conversation was last updated.

15. Bookings

Tracks booking details for livestreamers.
	•	Columns:
	•	id (bigint): Unique identifier for the booking.
	•	streamer_id (bigint): Foreign key referencing the streamers table.
	•	client_id (UUID): Foreign key referencing the users table (user type = client).
	•	start_time (timestamp): Booking start time.
	•	end_time (timestamp): Booking end time.
	•	platform (text): Platform for the livestream (e.g., TikTok, Shopee).
	•	price (numeric): Total price for the booking.
	•	status (text): Status of the booking (e.g., pending, completed, canceled).
	•	special_request (text): Client’s special requests for the booking.
	•	timezone (text): Timezone for the booking.
	•	stream_link (text): URL to the livestream link.
	•	payment_details (JSONB): Details about the payment.
	•	sub_acc_link (text): Link to the sub-account for the stream (if applicable).
	•	sub_acc_pass (text): Password for the sub-account (if applicable).
	•	created_at (timestamp): Timestamp when the booking was created.

16. Accepted Bookings

Tracks bookings that have been accepted by livestreamers.
	•	Columns:
	•	id (UUID): Unique identifier for the accepted booking.
	•	streamer_id (integer): Foreign key referencing the streamers table.
	•	client_id (UUID): Foreign key referencing the users table (user type = client).
	•	booking_date (date): Date of the booking.
	•	start_time (time): Start time of the booking.
	•	end_time (time): End time of the booking.
	•	created_at (timestamp): Timestamp when the booking was accepted.
	•	updated_at (timestamp): Timestamp when the booking record was last updated.

17. Streamer Verification Submissions

One row per KYC attempt by a streamer. Kept separate from the streamers table so identity documents sit behind their own RLS boundary, and so a rejected attempt stays on the record instead of being overwritten by the next try. An admin reviews each row and mirrors the outcome onto `streamers.verification_status`.
	•	Columns:
	•	id (UUID): Unique identifier for the submission.
	•	streamer_id (bigint): Foreign key referencing the streamers table (on delete cascade).
	•	user_id (UUID): Foreign key referencing auth.users (on delete cascade). The uploader.
	•	id_card_url (text): Storage path inside the private `verification_documents` bucket.
	•	selfie_url (text): Storage path to a selfie holding the ID.
	•	platform_proof_url (text): Storage path to a screenshot proving control of the TikTok/Shopee account.
	•	platform_handle (text): The streamer’s handle on that platform.
	•	status (text, not null, default 'pending'): 'pending' | 'approved' | 'rejected', enforced by a CHECK constraint. Indexed (`idx_streamer_verification_submissions_status`).
	•	notes (text): Reviewer notes; doubles as the rejection explanation shown to the streamer.
	•	reviewed_by (UUID): The admin who reviewed it (auth.users.id).
	•	reviewed_at (timestamptz): When it was reviewed.
	•	created_at / updated_at (timestamptz, not null): `updated_at` is stamped automatically by the `salda_set_updated_at` trigger.
	•	RLS: enabled, nothing granted to `anon`. A streamer reads submissions belonging to their own streamer profile, inserts only for themselves and only with status 'pending', and may edit a submission ONLY while it is still pending and only if it stays pending — that is what prevents a streamer from self-approving. There is no DELETE policy: the submission is the audit trail for a trust decision. Admins read and update everything.
	•	Indexed on `status` and `streamer_id`.

18. Streamer Payout Accounts

Bank accounts a streamer can be paid out to. Separate from the streamers table because a streamer may rotate accounts over time and the history matters for reconciliation.
	•	Columns:
	•	id (UUID): Unique identifier for the payout account.
	•	streamer_id (bigint): Foreign key referencing the streamers table (on delete cascade).
	•	bank_code (text, not null): Bank identifier used by the disbursement provider (e.g. bca, mandiri, bni, bri).
	•	bank_name (text, not null): Human-readable bank name.
	•	account_number (text, not null): Account number.
	•	account_holder_name (text, not null): Name on the account, checked against the bank before payout.
	•	is_primary (boolean, not null, default true): The account used for automatic disbursement. A partial unique index (`idx_streamer_payout_accounts_one_primary`) guarantees at most ONE primary row per streamer, so a payout always has exactly one destination.
	•	verified_at (timestamptz): Set once the holder name has been confirmed against the bank. Should only ever be written server-side.
	•	created_at / updated_at (timestamptz, not null): `updated_at` is stamped automatically by the `salda_set_updated_at` trigger.
	•	RLS: enabled, nothing granted to `anon` — bank details must never be readable with the public browser key. A streamer has full CRUD on rows attached to their own streamer profile; admins read and update all.

19. Signup Drafts

Server-side scratch space for a signup or setup flow the user has not finished, so progress survives closing the tab or switching from a phone to a laptop. Replaces the old localStorage draft, which kept a home address in plaintext on what is very often a shared or borrowed device, did not follow the user across devices, and told us nothing when it was abandoned.
	•	Columns:
	•	user_id (UUID, primary key): Owner. References auth.users (on delete cascade), so deleting an account takes the draft with it. ONE draft per account — saving is a plain upsert and duplicates are impossible.
	•	kind (text, not null): Which flow the draft belongs to, e.g. 'streamer_setup'. Free text rather than an enum so a new flow needs no migration. Must not be blank (`signup_drafts_kind_not_blank`).
	•	data (jsonb, not null, default '{}'): Partially-filled form values; the shape is owned by the application.
	•	updated_at (timestamptz, not null): Stamped by the `salda_set_updated_at` trigger. Doubles as the draft’s age, which is what a cleanup job and any “you left something unfinished” nudge key off. Indexed (`idx_signup_drafts_updated_at`).
	•	NEVER STORE in `data`: passwords, tokens, or the contents of an uploaded file. This is ordinary application data with none of the protections those need; files go to storage and only their path is recorded here. A CHECK constraint (`signup_drafts_data_size`) caps `data` at 32 KB — roomy for text fields, far too small for a base64 image — so the rule is enforced, not merely stated.
	•	RLS: enabled; `anon` is revoked outright and has no policy. A signed-in user can SELECT / INSERT / UPDATE / DELETE only the row where `user_id = auth.uid()`. There is deliberately no admin read policy: unlike a KYC submission, an unfinished draft is not evidence for any decision Salda has to make, so staff have no reason to read half-typed addresses. Support goes through the service-role key.

20. Onboarding Events

Append-only funnel log for signup and streamer setup. It exists because we could not tell whether a streamer quit at the photo or at the price, which made every decision about the flow guesswork. It is NOT a general analytics table and NOT a system of record — anything that matters is stored on the row it belongs to.
	•	Columns:
	•	id (UUID, primary key, default gen_random_uuid()).
	•	user_id (UUID): References auth.users ON DELETE SET NULL — when an account is deleted the person stops being identifiable, but the funnel shape they contributed to does not silently change underneath a report. NULL is also the legitimate value for a step that happens before an account exists, which only the service role can record. Indexed (`idx_onboarding_events_user`).
	•	event (text, not null): Step identifier, e.g. 'signup_started', 'role_selected', 'setup_photo_uploaded', 'setup_price_set'. Free text so instrumenting a new step costs nothing; the naming convention lives with the code that emits it.
	•	props (jsonb, not null, default '{}'): Small bag of context — which field failed validation, which milestone, how many attempts. NEVER personal data: every admin can read this table.
	•	created_at (timestamptz, not null): When the step happened. Indexed together with `event` (`idx_onboarding_events_event_created_at`), which is the shape of the “how many of event X per day” query.
	•	RLS: enabled; `anon` is revoked outright. An authenticated user may INSERT only rows where `user_id = auth.uid()` — they cannot attribute an event to someone else and cannot write an anonymous one. Only `public.is_admin()` may SELECT. There is no UPDATE and no DELETE policy: an event that the person it describes can rewrite measures nothing. Pre-account events and pruning are service-role work.

Storage buckets

	•	streamers (public): profile and gallery images.
	•	brand-guidelines (public): client brand guideline documents.
	•	verification_documents (PRIVATE, 10 MB limit, jpeg/png/webp/pdf): identity documents for KYC. Objects MUST be stored under a folder named after the uploader’s auth user id:

		verification_documents/<auth.uid()>/<filename>

	Storage RLS enforces exactly that prefix — a streamer can insert, read, and overwrite only inside their own folder, and admins can read everything. There is no delete policy; removing a document is a service-role action. Because the bucket is private, always hand the client a signed URL, never a public one.

Admin access

There is no admin role in the data model (`users.user_type` is only 'client' | 'streamer'). `app/admin/layout.tsx` gates the /admin section on a comma-separated `ADMIN_EMAILS` environment variable. Postgres cannot read that env var, so the same allowlist is mirrored into the `public.admin_users` table and read by `public.is_admin()`, which every admin RLS policy calls.

Grant admin by inserting a row (Supabase SQL editor, or any service-role connection):

	insert into public.admin_users (email, note)
	values ('owner@salda.id', 'Founder');

Revoke by deleting the row. The email must match the address the person signs in with, and it is compared case-insensitively against the caller's JWT email claim.

Note: migration `20260805120000` originally read this allowlist from an `app.admin_emails` database setting. That approach does not work on hosted Supabase — the `postgres` role there is not a superuser, so `alter database postgres set app.admin_emails = …` fails with `42501: permission denied to set parameter`. Migration `20260805130000` replaced it with the table above and carries over any value the setting did hold, so a local or self-hosted database that had it set does not regress.

Keep the table in sync with `ADMIN_EMAILS`. It is fail-closed: an empty table means `is_admin()` returns false for everyone and the admin policies grant nothing. The table itself has RLS enabled with no policies, so it is neither readable nor writable through the API under any session — that stops it from publishing the exact list of accounts worth phishing, and stops a signed-in user from escalating by inserting their own address. Server code using the service-role key (`utils/supabase/admin.ts`) bypasses RLS entirely and does not depend on it.

