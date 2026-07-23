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
          error: 'Invalid request body',
          details: 'Request body must be valid JSON'
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
          error: 'Missing required data',
          details: 'Both result and metadata are required'
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
          error: 'Payment verification failed',
          details: 'The transaction could not be verified with the payment provider.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (verified.isFailed) {
      console.warn('Payment reported as failed by Midtrans:', verified.transactionStatus, orderId);
      return new NextResponse(
        JSON.stringify({
          error: 'Payment not completed',
          details: `Transaction status is "${verified.transactionStatus}".`,
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
          error: 'Payment amount mismatch',
          details: 'The paid amount does not match the booking amount.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const bookings = await createBookingAfterPayment(result, metadata);
      console.log('Bookings created successfully:', JSON.stringify(bookings, null, 2));
      return NextResponse.json(bookings);
    } catch (error) {
      console.error('Error in createBookingAfterPayment:', error);
      
      // Return a more detailed error response with proper headers
      return new NextResponse(
        JSON.stringify({
          error: 'Failed to create booking',
          details: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error) {
    console.error('Payment callback error:', error);
    
    // Return a more detailed error response with proper headers
    return new NextResponse(
      JSON.stringify({
        error: 'Payment callback failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 