import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { createNotification } from "@/services/notification-service";
import { formatInTimeZone } from 'date-fns-tz';
import crypto from 'crypto';

/**
 * ============================================================================
 * PAYMENT STATE MACHINE
 * ============================================================================
 *
 * Midtrans notifications are neither ordered nor delivered once. A QRIS or
 * virtual-account payment genuinely produces `pending` and then `settlement`,
 * every notification is retried until it gets a 200, and a retry of an older
 * notification can land after a newer one. So the incoming status alone cannot
 * decide anything — only the pair (what we already recorded, what just arrived)
 * can.
 *
 *                             INCOMING
 *  STORED    | pending   | paid            | failed          | refund/chargeback
 *  ----------+-----------+-----------------+-----------------+------------------
 *  unknown   | record    | record + notify | record + cancel | record + cancel
 *  pending   | record    | record + notify | record + cancel | record + cancel
 *  paid      | IGNORE    | ignore (repeat) | IGNORE          | record + cancel
 *  failed    | IGNORE    | record + notify | ignore (repeat) | record
 *  refunded  | IGNORE    | IGNORE          | IGNORE          | ignore (repeat)
 *
 * The rules behind the table:
 *
 *  1. A settled payment is only movable by a refund or a chargeback. Nothing
 *     else means the money left again.
 *
 *  2. `pending` never overwrites a terminal state. It used to: the old
 *     idempotency check only short-circuited on (paid && alreadyPaid) or
 *     (failed && alreadyFailed), and `pending` is neither, so a retried
 *     `pending` fell through and rewrote a settled payment back to pending.
 *
 *  3. A late `cancel`/`expire` after settlement is ignored outright. It used to
 *     pass `isFailed && !alreadyFailed`, overwrite the status AND cancel every
 *     booking still in 'pending' — which is precisely the status a paid booking
 *     sits in while it waits for the streamer to accept. A paid booking became
 *     a cancelled one, silently.
 *
 *  4. failed -> paid IS allowed: money that actually arrives outranks a
 *     previous "this will never complete" (Midtrans can settle a VA transfer
 *     that races its own expiry). The bookings may already have been cancelled
 *     by rule 3's legitimate first pass, so this logs for reconciliation rather
 *     than silently un-cancelling work a streamer has already been told is off.
 *
 *  5. A partial refund/chargeback records the status but does not cancel: part
 *     of the money is still with us and the booking may well stand.
 */

type PaymentState = 'unknown' | 'pending' | 'paid' | 'failed' | 'refunded';

// Money is captured.
const PAID_STATUSES = new Set(['settlement', 'capture', 'success', 'paid', 'completed']);
// This payment will never complete.
const FAILED_STATUSES = new Set(['deny', 'cancel', 'expire', 'failure', 'failed']);
// Money that was captured has gone back.
const REFUND_STATUSES = new Set([
  'refund', 'partial_refund', 'chargeback', 'partial_chargeback', 'refunded',
]);
// ...and of those, the ones where ALL of it went back.
const FULL_REVERSAL_STATUSES = new Set(['refund', 'chargeback', 'refunded']);

// Bookings that are still only waiting to be paid for / accepted. A booking a
// streamer has already accepted, completed or is live on is never touched here.
const UNACCEPTED_BOOKING_STATUSES = ['pending', 'payment_pending'];

/** Rank so the strongest signal across the two stored columns wins. */
const STATE_RANK: Record<PaymentState, number> = {
  unknown: 0,
  pending: 1,
  failed: 2,
  paid: 3,
  refunded: 4,
};

function classify(status: unknown, fraudStatus?: string): PaymentState {
  if (typeof status !== 'string' || status === '') return 'unknown';
  const value = status.toLowerCase();

  if (REFUND_STATUSES.has(value)) return 'refunded';
  // A `capture` is only money in hand once fraud review accepts it; a
  // `challenge` is still undecided, so it counts as pending, not paid.
  if (value === 'capture') return fraudStatus === 'accept' ? 'paid' : 'pending';
  if (PAID_STATUSES.has(value)) return 'paid';
  if (FAILED_STATUSES.has(value)) return 'failed';
  return 'pending';
}

/**
 * What we already believe about this payment. `status` and `payment_status` are
 * written together but can disagree on a row half-updated by an older build, so
 * take the strongest of the two: never downgrade our belief about money.
 */
function storedState(payment: { status: unknown; payment_status: unknown }): PaymentState {
  const a = classify(payment.status);
  const b = classify(payment.payment_status);
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

type Effect = 'none' | 'notify_paid' | 'cancel_unpaid' | 'cancel_reversed';

interface Transition {
  apply: boolean;
  effect: Effect;
  reason: string;
}

const IGNORE = (reason: string): Transition => ({ apply: false, effect: 'none', reason });

/** The table above, as code. */
function decideTransition(
  stored: PaymentState,
  incoming: PaymentState,
  incomingStatus: string
): Transition {
  if (incoming === 'refunded') {
    if (stored === 'refunded') return IGNORE('refund already recorded');
    return {
      apply: true,
      // A partial reversal leaves a live booking live (rule 5).
      effect: FULL_REVERSAL_STATUSES.has(incomingStatus.toLowerCase())
        ? 'cancel_reversed'
        : 'none',
      reason: `money reversed (${incomingStatus})`,
    };
  }

  if (stored === 'refunded') {
    return IGNORE('payment is refunded; a refund is terminal');
  }

  if (incoming === 'paid') {
    if (stored === 'paid') return IGNORE('payment already settled');
    return {
      apply: true,
      effect: 'notify_paid',
      reason: stored === 'failed'
        ? 'settlement arrived after a recorded failure'
        : 'payment settled',
    };
  }

  if (incoming === 'failed') {
    // Rule 3: the bug. Never let a late cancel/expire undo a settlement.
    if (stored === 'paid') {
      return IGNORE(`late ${incomingStatus} after settlement; the money is captured`);
    }
    if (stored === 'failed') return IGNORE('failure already recorded');
    return { apply: true, effect: 'cancel_unpaid', reason: `payment ${incomingStatus}` };
  }

  // Rule 2: pending is the weakest signal there is. It may only ever be written
  // over nothing at all.
  if (stored === 'paid' || stored === 'failed') {
    return IGNORE(`pending notification arrived after a ${stored} payment`);
  }
  return { apply: true, effect: 'none', reason: 'still pending' };
}

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

/**
 * Notifications must not decide whether Midtrans gets a 200. One booking whose
 * notification insert fails cannot be allowed to abort the notifications for
 * the rest of the order, nor to trigger a retry of a notification we have
 * already applied (the retry would be correctly ignored, so nothing would be
 * re-sent anyway — it would just burn Midtrans' retry budget).
 */
async function safeNotify(
  payload: Parameters<typeof createNotification>[0],
  context: string
) {
  try {
    await createNotification(payload);
  } catch (error) {
    console.error(`[payment-webhook] notification failed (${context}):`, error);
  }
}

async function notifyPaid(supabase: any, paymentId: string) {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*, streamers(user_id, first_name, last_name)')
    .eq('payment_group_id', paymentId);

  if (error) throw error;

  for (const booking of bookings ?? []) {
    const when = formatInTimeZone(
      new Date(booking.start_time),
      booking.timezone || 'Asia/Jakarta',
      'dd MMMM HH:mm'
    );

    // Notify the client.
    await safeNotify({
      user_id: booking.client_id,
      streamer_id: booking.streamer_id,
      message: `Pembayaran untuk pesananmu dengan ${booking.streamers?.first_name ?? ''} pada ${when} sudah dikonfirmasi.`,
      type: 'booking_payment',
      booking_id: booking.id,
      is_read: false,
    }, `paid/client booking ${booking.id}`);

    // Notify the streamer (addressed to their user account).
    if (booking.streamers?.user_id) {
      await safeNotify({
        user_id: booking.streamers.user_id,
        streamer_id: booking.streamer_id,
        message: `Pesanan baru dari ${booking.client_first_name ?? 'seorang brand'} untuk ${when} sudah dibayar.`,
        type: 'booking_payment',
        booking_id: booking.id,
        is_read: false,
      }, `paid/streamer booking ${booking.id}`);
    }
  }
}

/**
 * Cancel the bookings attached to a payment that will not (or no longer does)
 * hold money, and tell the client why.
 *
 * Only bookings still waiting on payment/acceptance are cancelled. One a
 * streamer has already accepted is a scheduled commitment; unwinding it is a
 * support decision, not something a webhook should do behind everyone's back.
 */
async function cancelBookings(
  supabase: any,
  paymentId: string,
  transactionStatus: string,
  kind: 'unpaid' | 'reversed'
) {
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*, streamers(first_name, last_name)')
    .eq('payment_group_id', paymentId);

  if (error) throw error;

  const { data: cancelled, error: cancelError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('payment_group_id', paymentId)
    .in('status', UNACCEPTED_BOOKING_STATUSES)
    .select('id');

  if (cancelError) throw cancelError;

  // Notify exactly the bookings the update actually moved. If the update did not
  // return rows at all, fall back to the pre-read: better to notify from the
  // statuses we saw a moment ago than to cancel a booking in silence.
  const movedRows: any[] = cancelled
    ?? (bookings ?? []).filter((b: any) => UNACCEPTED_BOOKING_STATUSES.includes(b.status));
  const cancelledIds = new Set(movedRows.map((b: any) => b.id));

  const untouched = (bookings ?? []).filter((b: any) => !cancelledIds.has(b.id));
  if (untouched.length > 0) {
    console.warn(
      `[payment-webhook][RECONCILE] Payment ${paymentId} (${transactionStatus}): ` +
      `booking(s) ${untouched.map((b: any) => b.id).join(', ')} were already accepted or ` +
      'closed and were left alone. They need a support decision.'
    );
  }

  for (const booking of bookings ?? []) {
    if (!cancelledIds.has(booking.id)) continue;

    const when = formatInTimeZone(
      new Date(booking.start_time),
      booking.timezone || 'Asia/Jakarta',
      'dd MMMM HH:mm'
    );
    await safeNotify({
      user_id: booking.client_id,
      streamer_id: booking.streamer_id,
      message: kind === 'reversed'
        ? `Pembayaran untuk pesanan pada ${when} telah dikembalikan (${transactionStatus}), jadi pesanannya dibatalkan.`
        : `Pembayaran untuk pesanan pada ${when} tidak berhasil diselesaikan (${transactionStatus}). Pesanan dibatalkan.`,
      type: 'booking_cancelled',
      booking_id: booking.id,
      is_read: false,
    }, `cancelled booking ${booking.id}`);
  }
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
    const adminClient = createAdminClient();
    if (!adminClient) {
      console.error(
        'Payment webhook: SUPABASE_SERVICE_ROLE_KEY is not set, so this handler runs with the ' +
        'anon key. payments/bookings have RLS enabled with no policy for it, so every write ' +
        'below will be refused. This is a configuration problem, not a data problem.'
      );
    }
    const supabase = adminClient ?? createClient();
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
    const incoming = classify(transactionStatus, payload.fraud_status);

    // 2. Match the payment by its stored transaction_id (== Midtrans order_id).
    //    This is the correct join key: createBookingAfterPayment stores the
    //    order_id in payments.transaction_id, and bookings.payment_group_id
    //    references payments.id.
    //
    //    NOT `.maybeSingle()`. On a database where the unique index from
    //    20260806110000_payment_idempotency.sql has not been applied yet, a
    //    duplicated callback may have left two rows for one order — and
    //    maybeSingle() answers that with an error, which threw, returned a 500,
    //    and made Midtrans retry the same notification forever while the
    //    payment never reconciled. A duplicate is a data problem to shout
    //    about, not a reason to stop processing the notification.
    const { data: paymentRows, error: paymentFetchError } = await supabase
      .from('payments')
      .select('id, status, payment_status')
      .eq('transaction_id', payload.order_id)
      .order('created_at', { ascending: true });

    if (paymentFetchError) throw paymentFetchError;

    if (!paymentRows || paymentRows.length === 0) {
      // The client-side callback may not have recorded the payment yet
      // (Midtrans often calls the webhook before the browser redirect).
      // Acknowledge so Midtrans doesn't hammer retries; the callback path
      // creates the booking + payment with an authoritative status.
      console.warn('Payment webhook: no payment found for order', payload.order_id);
      return NextResponse.json({ received: true, note: 'payment not yet recorded' });
    }

    if (paymentRows.length > 1) {
      console.error(
        `[payment-webhook][RECONCILE] Order ${payload.order_id} has ${paymentRows.length} payment ` +
        'rows — one captured payment was recorded more than once, so it also has duplicate ' +
        'bookings. Apply supabase/migrations/20260806110000_payment_idempotency.sql (its ' +
        'section 3 has the cleanup). Processing all of them so the notification still settles.'
      );
    }

    // 3. Apply the state machine to each matched row.
    const results = [];
    for (const payment of paymentRows) {
      const stored = storedState(payment);
      const transition = decideTransition(stored, incoming, transactionStatus);

      if (!transition.apply) {
        console.log(
          `Payment webhook: ${payload.order_id} (${payment.id}) ${stored} <- ${transactionStatus}: ` +
          `ignored — ${transition.reason}`
        );
        results.push({ payment_id: payment.id, from: stored, applied: false, reason: transition.reason });
        continue;
      }

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

      // The status is now recorded, which means a retry of this notification
      // will be ignored — so a failure in the follow-up work below can never be
      // fixed by returning a 500, it would only cost Midtrans retries. Log it
      // for reconciliation and still acknowledge.
      try {
        if (transition.effect === 'notify_paid') {
          if (stored === 'failed') {
            console.warn(
              `[payment-webhook][RECONCILE] Payment ${payment.id} settled after being recorded as ` +
              'failed. Its bookings may already have been cancelled by the earlier notification and ' +
              'are NOT reinstated automatically.'
            );
          }
          await notifyPaid(supabase, payment.id);
        } else if (transition.effect === 'cancel_unpaid') {
          await cancelBookings(supabase, payment.id, transactionStatus, 'unpaid');
        } else if (transition.effect === 'cancel_reversed') {
          await cancelBookings(supabase, payment.id, transactionStatus, 'reversed');
        }
      } catch (effectError) {
        console.error(
          `[payment-webhook][RECONCILE] Payment ${payment.id}: status was set to ` +
          `${transactionStatus} but the follow-up (${transition.effect}) failed. This will not be ` +
          'retried — the bookings for this payment need a manual check.',
          effectError
        );
      }

      results.push({
        payment_id: payment.id,
        from: stored,
        to: incoming,
        applied: true,
        reason: transition.reason,
      });
    }

    return NextResponse.json({ success: true, results });
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
