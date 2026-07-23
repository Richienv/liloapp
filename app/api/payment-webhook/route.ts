import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { createNotification } from "@/services/notification-service";
import { formatInTimeZone } from 'date-fns-tz';
import crypto from 'crypto';

// Midtrans transaction_status values that mean the money is actually captured.
const PAID_STATUSES = new Set(['settlement', 'capture']);
// Values that mean the payment will never complete.
const FAILED_STATUSES = new Set(['deny', 'cancel', 'expire', 'failure']);

/**
 * Verify the Midtrans notification signature.
 * Midtrans signs every notification with:
 *   sha512(order_id + status_code + gross_amount + ServerKey)
 * and sends the result in `signature_key`. If it doesn't match, the payload
 * was not produced by Midtrans and must be rejected.
 */
function isValidSignature(payload: any, serverKey: string): boolean {
  const { order_id, status_code, gross_amount, signature_key } = payload;
  if (!order_id || !status_code || gross_amount === undefined || !signature_key) {
    return false;
  }
  const expected = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest('hex');
  // Constant-time compare to avoid timing side-channels.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature_key));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) {
      console.error('Payment webhook: MIDTRANS_SERVER_KEY is not configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Midtrans calls this server-to-server with no user session, and it writes
    // to RLS-protected tables. Use the service-role client so it bypasses RLS
    // (fall back to the anon server client only if the key isn't configured).
    const supabase = createAdminClient() ?? createClient();
    const payload = await request.json();

    // Validate the payment notification shape.
    if (!payload.transaction_status || !payload.order_id) {
      return NextResponse.json(
        { error: 'Invalid payment notification payload' },
        { status: 400 }
      );
    }

    // 1. Reject anything not genuinely signed by Midtrans.
    if (!isValidSignature(payload, serverKey)) {
      console.warn('Payment webhook: signature verification failed for order', payload.order_id);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const transactionStatus: string = payload.transaction_status;
    const fraudStatus: string | undefined = payload.fraud_status;
    // Treat a `capture` as paid only when it is not flagged as fraud.
    const isPaid =
      PAID_STATUSES.has(transactionStatus) &&
      (transactionStatus !== 'capture' || fraudStatus === 'accept');
    const isFailed = FAILED_STATUSES.has(transactionStatus);

    // 2. Match the payment by its stored transaction_id (== Midtrans order_id).
    //    This is the correct join key: createBookingAfterPayment stores the
    //    order_id in payments.transaction_id, and bookings.payment_group_id
    //    references payments.id. The previous `order_id.split('-')[1]` parsing
    //    extracted the timestamp segment and never matched a real row.
    const { data: payment, error: paymentFetchError } = await supabase
      .from('payments')
      .select('id, status, payment_status')
      .eq('transaction_id', payload.order_id)
      .maybeSingle();

    if (paymentFetchError) throw paymentFetchError;

    if (!payment) {
      // The client-side callback may not have recorded the payment yet
      // (Midtrans often calls the webhook before the browser redirect).
      // Acknowledge so Midtrans doesn't hammer retries; the callback path
      // creates the booking + payment with an authoritative status.
      console.warn('Payment webhook: no payment found for order', payload.order_id);
      return NextResponse.json({ received: true, note: 'payment not yet recorded' });
    }

    // 3. Idempotency: if we've already recorded this payment's terminal state
    //    and the incoming notification repeats it, do nothing (Midtrans retries
    //    the same notification until it gets a 200).
    const alreadyPaid =
      PAID_STATUSES.has(payment.status) || PAID_STATUSES.has(payment.payment_status);
    const alreadyFailed =
      FAILED_STATUSES.has(payment.status) || FAILED_STATUSES.has(payment.payment_status);
    if ((isPaid && alreadyPaid) || (isFailed && alreadyFailed)) {
      return NextResponse.json({ received: true, note: 'already processed' });
    }

    // 4. Sync the authoritative status onto the payment row.
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: transactionStatus,
        payment_status: transactionStatus,
        midtrans_response: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    if (updateError) throw updateError;

    // 5. Only notify on a genuine unpaid -> paid transition. In the normal
    //    flow the callback already created the "payment confirmed"
    //    notifications and set the payment to settled, so `alreadyPaid` is
    //    true here and we skip — preventing duplicate notifications.
    if (isPaid && !alreadyPaid) {
      const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select('*, streamers(user_id, first_name, last_name)')
        .eq('payment_group_id', payment.id);

      if (bookingError) throw bookingError;

      for (const booking of bookings ?? []) {
        const when = formatInTimeZone(
          new Date(booking.start_time),
          booking.timezone || 'Asia/Jakarta',
          'dd MMMM HH:mm'
        );

        // Notify the client.
        await createNotification({
          user_id: booking.client_id,
          streamer_id: booking.streamer_id,
          message: `Payment confirmed for your booking with ${booking.streamers?.first_name ?? ''} on ${when}.`,
          type: 'booking_payment',
          booking_id: booking.id,
          is_read: false,
        });

        // Notify the streamer (addressed to their user account).
        if (booking.streamers?.user_id) {
          await createNotification({
            user_id: booking.streamers.user_id,
            streamer_id: booking.streamer_id,
            message: `New booking payment received from ${booking.client_first_name ?? 'a client'} for ${when}.`,
            type: 'booking_payment',
            booking_id: booking.id,
            is_read: false,
          });
        }
      }
    } else if (isFailed && !alreadyFailed) {
      // Payment failed / was cancelled / expired. Cancel the bookings that are
      // still waiting on payment (don't touch ones a streamer already acted on)
      // and let the client know.
      const { data: bookings, error: bookingError } = await supabase
        .from('bookings')
        .select('*, streamers(first_name, last_name)')
        .eq('payment_group_id', payment.id);

      if (bookingError) throw bookingError;

      const { error: cancelError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('payment_group_id', payment.id)
        .in('status', ['pending', 'payment_pending']);

      if (cancelError) throw cancelError;

      for (const booking of bookings ?? []) {
        const when = formatInTimeZone(
          new Date(booking.start_time),
          booking.timezone || 'Asia/Jakarta',
          'dd MMMM HH:mm'
        );
        await createNotification({
          user_id: booking.client_id,
          streamer_id: booking.streamer_id,
          message: `Your payment for the booking on ${when} could not be completed (${transactionStatus}). The booking has been cancelled.`,
          type: 'booking_cancelled',
          booking_id: booking.id,
          is_read: false,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing payment webhook:', error);
    return NextResponse.json(
      {
        error: 'Failed to process payment webhook: ' + (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
}
