I have opened the images to verify the database structure. Now, I will create a proper database documentation based on the provided tables for your web app. Here’s the documentation for your team:

Database Documentation

This documentation describes the database structure for a web application that facilitates booking livestreamers for TikTok and Shopee Live to help businesses sell products through live streams. The application also integrates Midtrans for payment processing.

Tables Overview

1. Streamers

Stores information about livestreamers, including their associated details.
	•	Columns:
	•	id (bigint): Unique identifier for the livestreamer.
	•	user_id (UUID): Reference to the corresponding user in the users table.
	•	first_name (text): Livestreamer’s first name.
	•	last_name (text): Livestreamer’s last name.
	•	platform (text): The platform where the livestreamer operates (e.g., TikTok, Shopee).
	•	category (text): Category of products/services the streamer specializes in.
	•	price (numeric): Hourly rate of the livestreamer.
	•	image_url (text): URL to the livestreamer’s profile image.
	•	bio (text): Description or biography of the livestreamer.
	•	location (text): Livestreamer’s current location.
	•	full_address (text): Detailed address of the livestreamer.
	•	video_url (text): URL to a sample video or livestream demo.
	•	rating (numeric): Average rating given to the livestreamer.

2. Users

Contains details of all users, including business owners and livestreamers.
	•	Columns:
	•	id (UUID): Unique identifier for the user.
	•	email (text): User’s email address.
	•	first_name (text): User’s first name.
	•	last_name (text): User’s last name.
	•	user_type (text): Type of user (e.g., Client, Streamer).
	•	profile_picture_url (text): URL to the user’s profile picture.
	•	bio (text): Short biography of the user.
	•	brand_name (text): Name of the client’s brand, if applicable.
	•	brand_guidelines_url (text): URL to the client’s brand guidelines.
	•	location (text): User’s current location.
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

