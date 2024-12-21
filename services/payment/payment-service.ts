import { createClient } from "@/utils/supabase/client";
import midtransClient from 'midtrans-client';

// Initialize Snap client
const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
});

export interface PaymentMetadata {
  streamerId: string;
  userId: string;
  startTime: string;
  endTime: string;
  platform: string;
  specialRequest?: string;
  sub_acc_link?: string;
  sub_acc_pass?: string;
  firstName: string;
  lastName: string;
  price: number;
  voucher: {
    id: string;
    code: string;
    discountAmount: number;
  } | null;
  finalPrice: number;
}

interface PaymentDetails {
  amount: number;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  description: string;
  metadata: PaymentMetadata;
}

export async function createPayment(details: PaymentDetails) {
  try {
    // Generate Midtrans token first
    const transactionDetails = {
      transaction_details: {
        order_id: `BOOKING-TEMP-${Date.now()}`,
        gross_amount: details.metadata.finalPrice
      },
      customer_details: {
        first_name: details.clientName,
        email: details.clientEmail,
        phone: details.clientPhone || ''
      },
      credit_card: {
        secure: true
      },
      callbacks: {
        finish: `${process.env.NEXT_PUBLIC_SITE_URL}/client-bookings`
      }
    };

    const transaction = await snap.createTransaction(transactionDetails);

    if (!transaction || !transaction.token) {
      throw new Error('Failed to generate Midtrans token');
    }

    return {
      token: transaction.token,
      metadata: details.metadata
    };
  } catch (error) {
    console.error('Payment creation error:', error);
    throw error;
  }
}

interface BookingResponse {
  id: number;
  client_id: string;
  client_first_name: string;
  client_last_name: string;
}

// Add a new function to create booking after successful payment
export async function createBookingAfterPayment(
  result: any, 
  metadata: PaymentMetadata
): Promise<BookingResponse> {
  const supabase = createClient();
  
  try {
    // Create booking with original price and voucher info
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        client_id: metadata.userId,
        streamer_id: parseInt(metadata.streamerId),
        start_time: metadata.startTime,
        end_time: metadata.endTime,
        platform: metadata.platform,
        status: 'pending',
        special_request: metadata.specialRequest,
        sub_acc_link: metadata.sub_acc_link,
        sub_acc_pass: metadata.sub_acc_pass,
        price: metadata.price,
        voucher_id: metadata.voucher?.id || null,
        voucher_discount: metadata.voucher?.discountAmount || 0,
        final_price: metadata.finalPrice,
        client_first_name: metadata.firstName,
        client_last_name: metadata.lastName,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Create payment record with final price
    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingData.id,
        amount: metadata.finalPrice,
        status: 'success',
        payment_method: 'midtrans',
        transaction_id: result.order_id,
        midtrans_response: result
      });

    if (paymentError) throw paymentError;

    // Track voucher usage if voucher was applied
    if (metadata.voucher) {
      const { error: voucherError } = await supabase
        .from('voucher_usage')
        .insert({
          voucher_id: metadata.voucher.id,
          booking_id: bookingData.id,
          user_id: metadata.userId,
          discount_applied: metadata.voucher.discountAmount,
          original_price: metadata.price,
          final_price: metadata.finalPrice
        });

      if (voucherError) throw voucherError;
    }

    return {
      id: bookingData.id,
      client_id: bookingData.client_id,
      client_first_name: bookingData.client_first_name,
      client_last_name: bookingData.client_last_name
    };
  } catch (error) {
    console.error('Error creating booking:', error);
    throw error;
  }
}

export async function updatePaymentStatus(orderId: string, status: string, transactionDetails: any) {
  const supabase = createClient();
  try {
    // Extract booking ID from order ID (format: BOOKING-{id}-{timestamp})
    const bookingId = orderId.split('-')[1];
    
    if (!bookingId) throw new Error('Invalid order ID format');

    // Update booking status
    await supabase
      .from('bookings')
      .update({ 
        status: status === 'settlement' ? 'pending' : 'payment_pending',
        payment_status: status
      })
      .eq('id', parseInt(bookingId));

    // Update payment record
    const { data: payment } = await supabase
      .from('payments')
      .update({
        status: status,
        midtrans_response: transactionDetails
      })
      .eq('booking_id', parseInt(bookingId))
      .select()
      .single();

    if (payment) {
      // Record status history
      await supabase
        .from('payment_status_history')
        .insert({
          payment_id: payment.id,
          new_status: status,
          midtrans_notification: transactionDetails
        });
    }

  } catch (error) {
    console.error('Payment status update error:', error);
    throw error;
  }
} 