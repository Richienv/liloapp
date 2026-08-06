import { NextResponse } from 'next/server';
import {
  createBookingAfterPayment,
  verifyMidtransTransaction,
  type PaymentMetadata,
} from '@/services/payment/payment-service';

// Add these interfaces at the top of the file
interface Booking {
  date: string;
  timeRanges: string[];
  startTime: string;
  endTime: string;
}

interface PaymentCallbackBody {
  result: any; // You can make this more specific based on your payment provider's response type
  metadata: PaymentMetadata;
}

export async function POST(request: Request) {
  try {
    console.log('=== Payment Callback Start ===');
    
    // Better error handling for the request body
    let body: PaymentCallbackBody;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Error parsing request body:', error);
      return new NextResponse(
        JSON.stringify({
          error: 'Permintaan tidak valid',
          details: 'Data yang dikirim tidak bisa dibaca. Coba muat ulang halaman ini.'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    console.log('Raw callback body:', JSON.stringify(body, null, 2));

    const { result, metadata } = body;

    if (!result || !metadata) {
      console.error('Missing required data in callback:', { result, metadata });
      return new NextResponse(
        JSON.stringify({
          error: 'Data pemesanan tidak lengkap',
          details: 'Detail pembayaran dan pemesanan tidak terkirim. Coba muat ulang halaman ini.'
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('=== Payment Callback Data Validation ===');
    console.log('Payment result:', JSON.stringify(result, null, 2));
    console.log('Payment metadata:', JSON.stringify(metadata, null, 2));
    console.log('User timezone:', metadata.timezone);
    console.log('Booking time ranges:', JSON.stringify(metadata.bookings.map(b => ({
      date: b.date,
      timeRanges: b.timeRanges,
      startTime: b.startTime,
      endTime: b.endTime
    })), null, 2));

    // Verify the payment with Midtrans server-to-server before trusting the
    // client-supplied `result`/`metadata`. This prevents fabricated callbacks
    // (a made-up order_id 404s here) and amount tampering (the authoritative
    // amount comes from Midtrans, not the browser).
    const orderId: string = result?.order_id || result?.transaction_id;
    const verified = await verifyMidtransTransaction(orderId);

    if (!verified) {
      console.error('Payment verification failed — unknown or unverifiable order:', orderId);
      return new NextResponse(
        JSON.stringify({
          error: 'Pembayaran tidak bisa diverifikasi',
          details: 'Kami tidak menemukan transaksi ini di Midtrans. Kalau kamu merasa sudah membayar, hubungi tim Salda.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (verified.isFailed) {
      console.warn('Payment reported as failed by Midtrans:', verified.transactionStatus, orderId);
      return new NextResponse(
        JSON.stringify({
          error: 'Pembayaran belum selesai',
          details: `Status transaksinya "${verified.transactionStatus}", jadi pesanan belum bisa dibuat.`,
        }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // The amount Midtrans actually processed must match what the client claims.
    const claimedAmount = Math.round(Number(metadata.finalPrice));
    if (verified.grossAmount !== claimedAmount) {
      console.error('Payment amount mismatch:', {
        midtrans: verified.grossAmount,
        claimed: claimedAmount,
        orderId,
      });
      return new NextResponse(
        JSON.stringify({
          error: 'Nominal pembayaran tidak cocok',
          details: 'Jumlah yang dibayar berbeda dengan total pesanan. Hubungi tim Salda sebelum membayar lagi.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Safe to reach more than once for the same order: Snap's onSuccess fires
      // again on a double-click, a retried fetch or a reload of this page, and
      // createBookingAfterPayment() answers a repeat with the bookings it
      // already made instead of making a second set.
      const bookings = await createBookingAfterPayment(result, metadata);
      console.log('Bookings created successfully:', JSON.stringify(bookings, null, 2));
      return NextResponse.json(bookings);
    } catch (error) {
      // The money is already captured at this point, so the full diagnosis
      // belongs in the server log where an operator can act on it — not in a
      // response body the browser renders. `details` is what
      // app/booking-detail shows the user, so it stays a plain Indonesian
      // sentence and carries no internals.
      console.error('Error in createBookingAfterPayment for order', orderId, error);

      return new NextResponse(
        JSON.stringify({
          error: 'Pesanan gagal dibuat',
          details:
            'Pembayaranmu sudah diterima, tetapi pesanannya gagal dicatat. ' +
            'Jangan bayar lagi — hubungi tim Salda dengan menyebutkan kode pesanan ' +
            `${orderId} dan kami akan menyelesaikannya.`,
          orderId,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error) {
    console.error('Payment callback error:', error);

    return new NextResponse(
      JSON.stringify({
        error: 'Callback pembayaran gagal',
        details: 'Terjadi kesalahan saat memproses pembayaran. Coba muat ulang halaman ini.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
