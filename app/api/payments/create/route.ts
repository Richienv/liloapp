import { NextResponse } from 'next/server';
import { createPayment } from '@/services/payment/payment-service';
import { createClient } from '@/utils/supabase/server';
import { totalWithTax } from '@/lib/pricing';

/**
 * Create a Midtrans payment token.
 *
 * Everything that decides how much money changes hands is recomputed here from
 * the database. Previously this route took `body.metadata` verbatim and passed
 * `metadata.finalPrice` straight to Midtrans as `gross_amount`, with no session
 * check at all — so a booking for a Rp 500.000 host could be paid for with
 * Rp 1.000 simply by editing the request. The callback's guard did not help:
 * it compares Midtrans' gross against `metadata.finalPrice`, and both sides
 * descend from the same client-supplied number, so it detects tampering
 * *between* create and callback, never tampering *at* create.
 *
 * The client is still trusted for things it legitimately owns — which dates it
 * picked, the special request, the sub-account details. It is not trusted for
 * price, hours, identity, or whether a voucher applies.
 */

/** Hours are derived from the picked ranges, never from a client-supplied total. */
function hoursFromBookings(bookings: unknown): number | null {
  if (!Array.isArray(bookings) || bookings.length === 0) return null;

  let total = 0;
  for (const booking of bookings) {
    const hours = Number((booking as { hours?: unknown })?.hours);
    // A non-finite or non-positive block is malformed input, not a zero-hour
    // booking: fail the request rather than silently charging for less.
    if (!Number.isFinite(hours) || hours <= 0) return null;
    total += hours;
  }

  return total > 0 ? total : null;
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Kamu harus masuk untuk melakukan pembayaran.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const metadata = body?.metadata;

    if (!metadata || typeof metadata !== 'object') {
      return NextResponse.json({ error: 'Data pemesanan tidak lengkap.' }, { status: 400 });
    }

    const streamerId = Number(metadata.streamerId);
    if (!Number.isFinite(streamerId)) {
      return NextResponse.json({ error: 'Host tidak valid.' }, { status: 400 });
    }

    const totalHours = hoursFromBookings(metadata.bookings);
    if (totalHours === null) {
      return NextResponse.json({ error: 'Jadwal pemesanan tidak valid.' }, { status: 400 });
    }

    // The price comes from the row, and the bookability rule is re-checked here
    // because /booking-detail is reachable by URL — without this, an unverified
    // or paused host could still be paid for.
    const { data: streamer, error: streamerError } = await supabase
      .from('streamers')
      .select('id, price, is_active, verification_status')
      .eq('id', streamerId)
      .maybeSingle();

    if (streamerError) {
      console.error('Payment create: streamer lookup failed', streamerError);
      return NextResponse.json({ error: 'Gagal memuat data host.' }, { status: 500 });
    }

    if (!streamer || !streamer.is_active || streamer.verification_status !== 'approved') {
      return NextResponse.json(
        { error: 'Host ini sedang tidak bisa dipesan.' },
        { status: 409 }
      );
    }

    const basePrice = Number(streamer.price);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return NextResponse.json(
        { error: 'Host ini belum menetapkan harga, jadi belum bisa dipesan.' },
        { status: 409 }
      );
    }

    // Same formula the checkout screen shows: base + 30% platform fee + 11% tax,
    // per hour. Rounded once, at the end, so the charged amount matches the
    // displayed one exactly rather than drifting by a rupiah.
    const grossTotal = Math.round(totalWithTax(basePrice) * totalHours);

    // Re-validate the voucher against the table. The client sends a
    // `discountAmount` it computed itself; it is read only to be replaced.
    let discountAmount = 0;
    let voucher: { id: string; code: string; discountAmount: number } | null = null;

    const requestedCode =
      typeof metadata.voucher?.code === 'string' ? metadata.voucher.code.trim() : '';

    if (requestedCode) {
      const { data: voucherRow, error: voucherError } = await supabase
        .from('vouchers')
        .select('id, code, discount_amount, remaining_quantity, is_active, expires_at')
        .eq('code', requestedCode.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (voucherError) {
        console.error('Payment create: voucher lookup failed', voucherError);
        return NextResponse.json({ error: 'Gagal memeriksa voucher.' }, { status: 500 });
      }

      const usable =
        voucherRow &&
        new Date(voucherRow.expires_at) >= new Date() &&
        voucherRow.remaining_quantity > 0;

      if (!usable) {
        // Refuse rather than silently dropping the discount: the user is looking
        // at a total that included it, and quietly charging more is worse than
        // sending them back to re-check.
        return NextResponse.json(
          { error: 'Voucher tidak berlaku lagi. Muat ulang halaman dan coba lagi.' },
          { status: 409 }
        );
      }

      discountAmount = Math.min(Number(voucherRow.discount_amount) || 0, grossTotal);
      voucher = {
        id: voucherRow.id,
        code: voucherRow.code,
        discountAmount,
      };
    }

    const finalPrice = Math.max(0, grossTotal - discountAmount);

    // Log a mismatch rather than rejecting it. A legitimate one happens when the
    // host changes their price while a checkout screen is open, and failing the
    // payment there would be worse than charging the correct current amount —
    // but it is also exactly what tampering looks like, so it must be visible.
    const claimedFinalPrice = Number(metadata.finalPrice);
    if (Number.isFinite(claimedFinalPrice) && claimedFinalPrice !== finalPrice) {
      console.warn(
        `Payment create: client sent finalPrice=${claimedFinalPrice} but server computed ${finalPrice}`,
        { userId: user.id, streamerId, totalHours }
      );
    }

    const paymentDetails = await createPayment({
      amount: finalPrice,
      clientName: body.clientName,
      clientEmail: user.email ?? body.clientEmail,
      description: body.description,
      metadata: {
        ...metadata,
        // Server-owned fields overwrite whatever arrived. `userId` in particular
        // was previously taken from the body and written to `bookings.client_id`,
        // so a caller could attribute a booking to somebody else's account.
        userId: user.id,
        streamerId: String(streamer.id),
        price: basePrice,
        totalHours,
        totalPrice: grossTotal,
        voucher,
        finalPrice,
      },
    });

    if (!paymentDetails || !paymentDetails.token) {
      return NextResponse.json(
        { error: 'Failed to generate payment token' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      token: paymentDetails.token,
      // The metadata the client gets back is the server's version, so whatever
      // it forwards to the callback already carries the authoritative numbers.
      metadata: paymentDetails.metadata,
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
