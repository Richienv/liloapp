import { createClient } from "@/utils/supabase/client";
import midtransClient from 'midtrans-client';

// Initialize Snap client with proper error handling
const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY || '',
  clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''
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
    // Validate environment variables
    if (!process.env.MIDTRANS_SERVER_KEY || !process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY) {
      throw new Error('Midtrans configuration is missing');
    }

    console.log('=== Create Payment Start ===');
    console.log('Payment details:', details);

    // Generate a proper order ID format
    const orderId = `BOOKING-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log('Generated order ID:', orderId);
    
    // Get site URL with fallback
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    // Generate Midtrans token
    const transactionDetails = {
      transaction_details: {
        order_id: orderId,
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
        finish: `${siteUrl}/client-bookings`
      }
    };

    console.log('Transaction details for Midtrans:', transactionDetails);

    const transaction = await snap.createTransaction(transactionDetails);
    console.log('Midtrans response:', transaction);

    if (!transaction || !transaction.token) {
      console.error('No token in Midtrans response');
      throw new Error('Failed to generate Midtrans token');
    }

    console.log('=== Create Payment Complete ===');

    return {
      token: transaction.token,
      metadata: details.metadata,
      orderId: orderId
    };
  } catch (error) {
    console.error('=== Create Payment Error ===');
    console.error('Error details:', error);
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
    const transactionId = result.order_id || result.transaction_id;
    if (!transactionId) {
      throw new Error('Missing transaction ID in payment result');
    }

    // Create booking first
    const bookingInsert = {
      client_id: metadata.userId,
      streamer_id: parseInt(metadata.streamerId),
      start_time: metadata.startTime,
      end_time: metadata.endTime,
      platform: metadata.platform,
      status: 'pending',
      special_request: metadata.specialRequest || null,
      sub_acc_link: metadata.sub_acc_link || null,
      sub_acc_pass: metadata.sub_acc_pass || null,
      price: metadata.price, // Original price
      client_first_name: metadata.firstName,
      client_last_name: metadata.lastName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      stream_link: null,
      items_received: false,
      items_received_at: null,
      reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('Inserting booking:', bookingInsert);

    // Insert booking
    const { data: newBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert([bookingInsert])
      .select()
      .single();

    if (bookingError) {
      console.error('Booking creation error:', bookingError);
      throw bookingError;
    }

    // Handle voucher if present
    if (metadata.voucher) {
      // Record voucher usage with final price
      const { error: voucherError } = await supabase
        .from('voucher_usage')
        .insert({
          voucher_id: metadata.voucher.id,
          booking_id: newBooking.id,
          user_id: metadata.userId,
          discount_applied: metadata.voucher.discountAmount,
          original_price: metadata.price,
          final_price: metadata.finalPrice, // Final price goes here
          used_at: new Date().toISOString()
        });

      if (voucherError) {
        console.error('Voucher usage tracking error:', voucherError);
        throw voucherError;
      }

      // Update voucher quantity
      const { error: updateError } = await supabase
        .rpc('decrement_voucher_quantity', {
          voucher_uuid: metadata.voucher.id
        });

      if (updateError) {
        console.error('Error updating voucher quantity:', updateError);
        throw updateError;
      }
    }

    // Create payment record
    const paymentInsert = {
      booking_id: newBooking.id,
      amount: metadata.finalPrice,
      status: 'success',
      payment_method: 'midtrans',
      transaction_id: transactionId,
      payment_token: result.token || null,
      payment_url: result.redirect_url || null,
      midtrans_response: result,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: paymentError } = await supabase
      .from('payments')
      .insert([paymentInsert]);

    if (paymentError) {
      console.error('Payment record creation error:', paymentError);
      throw paymentError;
    }

    // Create notifications
    const notifications = [
      {
        user_id: metadata.userId,
        message: `Booking confirmed with ${metadata.firstName} ${metadata.lastName}. Payment successful.`,
        type: 'confirmation',
        booking_id: newBooking.id,
        streamer_id: parseInt(metadata.streamerId),
        created_at: new Date().toISOString(),
        is_read: false
      },
      {
        user_id: newBooking.streamer_id,
        message: `New booking request from ${metadata.firstName} ${metadata.lastName}. Payment confirmed.`,
        type: 'confirmation',
        booking_id: newBooking.id,
        streamer_id: parseInt(metadata.streamerId),
        created_at: new Date().toISOString(),
        is_read: false
      }
    ];

    await supabase.from('notifications').insert(notifications);

    return {
      id: newBooking.id,
      client_id: newBooking.client_id,
      client_first_name: newBooking.client_first_name,
      client_last_name: newBooking.client_last_name
    };

  } catch (error) {
    console.error('Error in createBookingAfterPayment:', error);
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