import { NextResponse } from 'next/server';
import { createPayment } from '@/services/payment/payment-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('Payment creation request:', body);
    
    // Create payment token first
    const paymentDetails = await createPayment({
      amount: body.amount,
      clientName: body.clientName,
      clientEmail: body.clientEmail,
      description: body.description,
      metadata: body.metadata
    });
    
    if (!paymentDetails || !paymentDetails.token) {
      console.error('No payment token generated');
      return NextResponse.json(
        { error: 'Failed to generate payment token' },
        { status: 500 }
      );
    }
    
    console.log('Payment token generated:', paymentDetails);
    
    return NextResponse.json(paymentDetails);
  } catch (error) {
    console.error('Payment creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
} 