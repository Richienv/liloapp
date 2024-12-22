import { NextResponse } from 'next/server';
import { createBookingAfterPayment } from '@/services/payment/payment-service';

export async function POST(req: Request) {
  try {
    // First check if request has content
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }

    // Get the raw text first
    const text = await req.text();
    if (!text) {
      return NextResponse.json(
        { error: 'Empty request body' },
        { status: 400 }
      );
    }

    // Try to parse JSON
    let body;
    try {
      body = JSON.parse(text);
    } catch (error) {
      console.error('Failed to parse request body:', error);
      console.error('Raw body:', text);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    console.log('Payment callback received:', body);

    if (!body.metadata || !body.result) {
      console.error('Missing required data:', body);
      return NextResponse.json(
        { error: 'Missing required payment data' },
        { status: 400 }
      );
    }

    const bookingData = await createBookingAfterPayment(body.result, body.metadata);
    
    return NextResponse.json({ 
      success: true, 
      data: bookingData 
    });
  } catch (error) {
    console.error('Payment callback error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to process payment callback',
        details: error
      },
      { status: 500 }
    );
  }
} 