Database Documentation

This documentation describes the database structure for a web application that facilitates booking livestreamers for TikTok and Shopee Live to help businesses sell products through live streams. The application also integrates Midtrans for payment processing.

THE BOOKABILITY RULE — read this first

A streamer is publicly listed and bookable only when:

	is_active = true AND verification_status = 'approved'

Every public query — the marketplace listing, the `/location/<slug>` city pages, `sitemap.xml`, and the `/[username]` profile page — MUST apply both conditions. `is_active` is the streamer's own on/off switch; `verification_status` is Salda's trust decision, and only an admin can change it. Neither one alone is sufficient.

Tables Overview

1. Streamers

Stores information about livestreamers, including their associated details.
	•	Columns:
	•	id (bigint): Unique identifier for the livestreamer.
	•	user_id (UUID): Reference to the corresponding user in the users table.
	•	username (text): Public profile slug. This is the whole public SEO surface: the `/[username]` route, the canonical URL in structured data, and the sitemap entry. Unique CASE-INSENSITIVELY via the `streamers_username_lower_key` index on `lower(username)` — a duplicate insert fails with SQLSTATE 23505 naming that index. Nullable in the database only so a deploy cannot break in-flight inserts; signup always writes one. Generated and validated by `lib/username.ts`.
	•	first_name (text): Livestreamer’s first name.
	•	last_name (text): Livestreamer’s last name.
	•	platform (text): The platform where the livestreamer operates (e.g., TikTok, Shopee).
	•	category (text): Category of products/services the streamer specializes in.
	•	price (numeric): Hourly rate of the livestreamer.
	•	image_url (text): URL to the livestreamer’s profile image.
	•	bio (text): Description or biography of the livestreamer.
	•	location (text): Free-text location as typed at signup. LEGACY — kept for display and old reads; filter on `city_slug` instead.
	•	city_slug (text): Canonical city slug from the 30-city registry in `lib/cities.ts`. Powers `/location/<slug>` SEO pages and shipping logistics. Backfilled best-effort from `location`; NULL when the legacy text matched no city. Indexed (`idx_streamers_city_slug`).
	•	full_address (text): Detailed address of the livestreamer.
	•	video_url (text): URL to a sample video or livestream demo.
	•	rating (numeric): Average rating given to the livestreamer.
	•	is_active (boolean, not null, default true): The streamer’s own availability switch. False hides the profile from search and booking without deleting it.
	•	verification_status (text, not null, default 'pending'): One of 'pending' | 'approved' | 'rejected' | 'suspended', enforced by `streamers_verification_status_check`. New signups start 'pending'. Every streamer that existed before this column was introduced was grandfathered to 'approved' so nobody who was bookable stopped being bookable. Indexed (`idx_streamers_verification_status`).
	•	verified_at (timestamptz): When the streamer reached 'approved'.
	•	verified_by (UUID): The admin (auth.users.id) who approved them. NULL for grandfathered rows — no human actually reviewed those.
	•	rejection_reason (text): Why verification was rejected, shown back to the streamer.

2. Users

Contains details of all users, including business owners and livestreamers.
	•	Columns:
	•	id (UUID): Unique identifier for the user.
	•	email (text): User’s email address.
	•	first_name (text): User’s first name.
	•	last_name (text): User’s last name.
	•	user_type (text): Type of user (e.g., Client, Streamer). There is no 'admin' value — see “Admin access” at the end of this document.
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

Storage buckets

	•	streamers (public): profile and gallery images.
	•	brand-guidelines (public): client brand guideline documents.
	•	verification_documents (PRIVATE, 10 MB limit, jpeg/png/webp/pdf): identity documents for KYC. Objects MUST be stored under a folder named after the uploader’s auth user id:

		verification_documents/<auth.uid()>/<filename>

	Storage RLS enforces exactly that prefix — a streamer can insert, read, and overwrite only inside their own folder, and admins can read everything. There is no delete policy; removing a document is a service-role action. Because the bucket is private, always hand the client a signed URL, never a public one.

Admin access

There is no admin role in the data model (`users.user_type` is only 'client' | 'streamer'). `app/admin/layout.tsx` gates the /admin section on a comma-separated `ADMIN_EMAILS` environment variable. Postgres cannot read that env var, so the same allowlist is mirrored into a database setting and read by `public.is_admin()`, which every admin RLS policy calls:

	alter database postgres set app.admin_emails = 'owner@salda.id,ops@salda.id';

Keep this in sync with `ADMIN_EMAILS`. It is fail-closed: an unset setting means `is_admin()` returns false for everyone and the admin policies grant nothing. Server code using the service-role key (`utils/supabase/admin.ts`) bypasses RLS entirely and does not depend on it.

