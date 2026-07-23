import { createClient } from "@/utils/supabase/client";
import { createAdminClient } from "@/utils/supabase/admin";
import midtransClient from 'midtrans-client';
import { createNotification, type NotificationType } from '@/services/notification-service';
import { format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import crypto from 'crypto';

// Initialize Snap client with proper error handling
const snap = new midtransClient.Snap({
  isProduction: true,
  serverKey: process.env.MIDTRANS_SERVER_KEY || '',
  clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || ''
});

export interface VerifiedTransaction {
  orderId: string;
  transactionStatus: string;
  fraudStatus?: string;
  grossAmount: number; // rounded to the nearest integer (IDR has no minor units in use here)
  isPaid: boolean;     // settlement, or capture+accept
  isFailed: boolean;   // deny / cancel / expire / failure
}

/**
 * Ask Midtrans directly for the authoritative status of a transaction.
 *
 * This is the server-to-server source of truth. A fabricated `order_id` will
 * 404 here (returns null), and the real `gross_amount` comes from Midtrans —
 * not from the browser — so a client cannot claim it paid a different amount
 * than it actually did.
 *
 * We reuse the Snap client's `transaction` helper: its `status()` call always
 * targets the Core API `/v2/{orderId}/status` endpoint, so no separate CoreApi
 * instance is needed.
 */
export async function verifyMidtransTransaction(
  orderId: string
): Promise<VerifiedTransaction | null> {
  if (!orderId) return null;
  try {
    // midtrans-client is a plain-JS library; TS's allowJs inference exposes the
    // Snap class's prototype methods but not the constructor-assigned
    // `transaction` helper, so we access it through an untyped view.
    const status = await (snap as any).transaction.status(orderId);
    const transactionStatus: string = status.transaction_status;
    const fraudStatus: string | undefined = status.fraud_status;
    const grossAmount = Math.round(parseFloat(status.gross_amount ?? '0'));
    const isPaid =
      transactionStatus === 'settlement' ||
      (transactionStatus === 'capture' && fraudStatus === 'accept');
    const isFailed = ['deny', 'cancel', 'expire', 'failure'].includes(transactionStatus);
    return { orderId, transactionStatus, fraudStatus, grossAmount, isPaid, isFailed };
  } catch (error: any) {
    // Midtrans throws for a non-existent order id (HTTP 404) — treat as unverified.
    console.error('Midtrans verification failed for order', orderId, error?.message || error);
    return null;
  }
}

export interface PaymentMetadata {
  streamerId: string;
  userId: string;
  bookings: Array<{
    date: string;
    startTime: string;
    endTime: string;
    hours: number;
    timeRanges: Array<{
      start: string;
      end: string;
      duration: number;
    }>;
  }>;
  timezone: string;
  platform: string;
  specialRequest: string;
  sub_acc_link: string;
  sub_acc_pass: string;
  firstName: string;
  lastName: string;
  price: number;
  totalHours: number;
  totalPrice: number;
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

export async function createBookingAfterPayment(
  result: any, 
  metadata: PaymentMetadata
): Promise<BookingResponse[]> {
  // This runs server-side with no user session, and it writes to RLS-protected
  // tables (bookings, payments, voucher_usage, notifications). Use the
  // service-role client so those writes bypass RLS; fall back to the anon client
  // only if the service-role key isn't configured (pre-RLS behavior).
  const supabase = createAdminClient() ?? createClient();
  const startTime = Date.now();
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Helper function for conditional logging
  const log = (message: string, data?: any) => {
    console.log(`[${Date.now() - startTime}ms] ${message}`);
    
    // Detailed logging only in development environment
    if (!isProduction && data) {
      console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    }
  };
  
  try {
    log('Creating booking after payment');
    
    const transactionId = result.order_id || result.transaction_id;
    if (!transactionId) {
      throw new Error('Missing transaction ID in payment result');
    }

    // Create bookings array with proper time blocks
    log('Processing bookings');
    log('User timezone from metadata:', metadata.timezone);
    
    const bookingInserts = metadata.bookings.map(booking => {
      // If no timeRanges, create a single booking
      const timeBlocks = booking.timeRanges?.length ? booking.timeRanges : [{
        start: booking.startTime.split('T')[1] || booking.startTime,
        end: booking.endTime.split('T')[1] || booking.endTime,
        duration: booking.hours
      }];
      
      // Create a booking for each time block
      return timeBlocks.map(block => {
        // Create dates with proper timezone handling
        const dateStr = booking.date;
        // Reduce to the naive wall-clock "HH:mm[:ss]" (strip any date prefix,
        // fractional seconds, trailing 'Z', or numeric offset). This also
        // prevents a double timezone conversion when a full ISO string is passed.
        const startTimeStr = (block.start.split('T')[1] || block.start).match(/^\d{2}:\d{2}(:\d{2})?/)?.[0] || block.start;
        const endTimeStr = (block.end.split('T')[1] || block.end).match(/^\d{2}:\d{2}(:\d{2})?/)?.[0] || block.end;
        
        // Log time details for debugging
        log(`Creating booking with date: ${dateStr}, start: ${startTimeStr}, end: ${endTimeStr}, timezone: ${metadata.timezone}`);
        
        // Convert the user's wall-clock booking time to UTC using the IANA
        // timezone. date-fns-tz's fromZonedTime handles DST correctly, unlike
        // the old fixed-offset table (which was off by 1h half the year in
        // DST zones). For Indonesia (no DST) the result is unchanged.
        const userTz = metadata.timezone || 'Asia/Jakarta';

        log(`Converting time with timezone: ${dateStr}T${startTimeStr} in ${userTz}`);

        const startTimeUTC = fromZonedTime(`${dateStr}T${startTimeStr}`, userTz);
        const endTimeUTC = fromZonedTime(`${dateStr}T${endTimeStr}`, userTz);

        log(`Converted to UTC:
          Original wall-clock: ${dateStr}T${startTimeStr} - ${endTimeStr}
          Converted UTC: ${startTimeUTC.toISOString()} - ${endTimeUTC.toISOString()}
          User timezone: ${userTz}
        `);

        // Create booking record with UTC times
        return {
          client_id: metadata.userId,
          streamer_id: parseInt(metadata.streamerId),
          start_time: startTimeUTC.toISOString(),
          end_time: endTimeUTC.toISOString(),
          platform: metadata.platform,
          status: 'pending',
          special_request: metadata.specialRequest || null,
          sub_acc_link: metadata.sub_acc_link || null,
          sub_acc_pass: metadata.sub_acc_pass || null,
          // FIX 1: split the total proportionally to this block's hours.
          // Guard against a missing/zero totalHours by falling back to the old
          // even split. The rounding remainder is reconciled in a second pass
          // below so the per-row prices sum EXACTLY to finalPrice.
          price: (metadata.totalHours && metadata.totalHours > 0)
            ? Math.round(metadata.finalPrice * block.duration / metadata.totalHours)
            : Math.round(metadata.finalPrice / metadata.bookings.length / (timeBlocks.length || 1)),
          client_first_name: metadata.firstName,
          client_last_name: metadata.lastName,
          timezone: metadata.timezone, // Store the original timezone
          stream_link: null,
          items_received: false,
          items_received_at: null,
          reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });
    }).flat();

    // FIX 1 (second pass): when splitting proportionally, per-row Math.round can
    // make the prices drift from finalPrice by a few IDR. Add the leftover to the
    // last booking so the rows sum EXACTLY to finalPrice.
    if (metadata.totalHours && metadata.totalHours > 0 && bookingInserts.length > 0) {
      const sumRounded = bookingInserts.reduce((acc, b) => acc + b.price, 0);
      bookingInserts[bookingInserts.length - 1].price += metadata.finalPrice - sumRounded;
    }

    log(`Total bookings to create: ${bookingInserts.length}`);

    // Process bookings in chunks of 10
    const CHUNK_SIZE = 10;
    const bookingChunks = [];
    for (let i = 0; i < bookingInserts.length; i += CHUNK_SIZE) {
      bookingChunks.push(bookingInserts.slice(i, i + CHUNK_SIZE));
    }
    
    log(`Split into ${bookingChunks.length} chunks of max ${CHUNK_SIZE} bookings each`);

    // Insert bookings in chunks
    const newBookings = [];
    for (let i = 0; i < bookingChunks.length; i++) {
      const chunk = bookingChunks[i];
      log(`Processing chunk ${i+1}/${bookingChunks.length} (${chunk.length} bookings)`);
      
      const { data, error } = await supabase
        .from('bookings')
        .insert(chunk)
        .select();

      if (error) {
        log(`Error inserting chunk ${i+1}:`, error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        log(`No bookings returned for chunk ${i+1}`);
        continue;
      }
      
      log(`Successfully inserted ${data.length} bookings in chunk ${i+1}`);
      newBookings.push(...data);
    }
    
    if (newBookings.length === 0) {
      throw new Error('Failed to create any bookings');
    }
    
    log(`Successfully created ${newBookings.length} bookings in total`);

    // Create payment record with the first booking's ID
    log('Creating payment record');
    const paymentInsert = {
      booking_id: newBookings[0].id,
      amount: metadata.finalPrice,
      status: 'success',
      payment_method: 'midtrans',
      transaction_id: transactionId,
      payment_token: result.token || null,
      payment_url: result.redirect_url || null,
      payment_status: 'settlement',
      midtrans_response: result,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insert payment and get the created payment record
    const { data: newPayment, error: paymentError } = await supabase
      .from('payments')
      .insert([paymentInsert])
      .select()
      .single();

    if (paymentError || !newPayment) {
      log('Payment record creation error:', paymentError);
      throw paymentError || new Error('Failed to create payment record');
    }

    log('Successfully created payment record');

    // Update all bookings with the payment's ID as the payment_group_id
    // Process update in chunks as well if there are many bookings
    const bookingIds = newBookings.map(b => b.id);
    const idChunks = [];
    for (let i = 0; i < bookingIds.length; i += CHUNK_SIZE) {
      idChunks.push(bookingIds.slice(i, i + CHUNK_SIZE));
    }
    
    log(`Updating ${bookingIds.length} bookings with payment group ID`);
    
    for (let i = 0; i < idChunks.length; i++) {
      const chunk = idChunks[i];
      log(`Updating payment group for ${chunk.length} bookings (chunk ${i+1}/${idChunks.length})`);
      
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ payment_group_id: newPayment.id })
        .in('id', chunk);

      if (updateError) {
        log(`Error updating chunk ${i+1} with payment ID:`, updateError);
        throw updateError;
      }
    }

    // Handle voucher if present
    if (metadata.voucher) {
      log('Processing voucher usage');
      const { error: voucherError } = await supabase
        .from('voucher_usage')
        .insert({
          voucher_id: metadata.voucher.id,
          booking_id: newBookings[0].id,
          user_id: metadata.userId,
          discount_applied: metadata.voucher.discountAmount,
          original_price: metadata.totalPrice,
          final_price: metadata.finalPrice,
          used_at: new Date().toISOString()
        });

      if (voucherError) {
        log('Voucher usage tracking error:', voucherError);
        throw voucherError;
      }

      const { error: updateError } = await supabase
        .rpc('decrement_voucher_quantity', {
          voucher_uuid: metadata.voucher.id
        });

      if (updateError) {
        log('Error updating voucher quantity:', updateError);
        throw updateError;
      }
      
      log('Voucher processed successfully');
    }

    // Create notifications for each booking asynchronously
    // We don't need to wait for notifications to complete
    log('Creating notifications (asynchronous)');
    createNotificationsAsync(newBookings, metadata, supabase);
    
    log(`Booking process completed successfully in ${Date.now() - startTime}ms`);
    
    // Return the booking information
    return newBookings.map(booking => ({
      id: booking.id,
      client_id: booking.client_id,
      client_first_name: booking.client_first_name,
      client_last_name: booking.client_last_name
    }));

  } catch (error) {
    console.error(`Error in createBookingAfterPayment after ${Date.now() - startTime}ms:`, error);
    throw error;
  }
}

// Helper function to create notifications asynchronously
async function createNotificationsAsync(
  bookings: any[], 
  metadata: PaymentMetadata, 
  supabase: any
) {
  try {
    // First fetch the streamer's user_id (do this once)
    const { data: streamerData, error: streamerError } = await supabase
      .from('streamers')
      .select('user_id')
      .eq('id', metadata.streamerId)
      .single();
    
    if (streamerError) {
      console.error('Error fetching streamer user_id:', streamerError);
      return; // Non-blocking, continue even if error
    }

    // Process notifications in batches
    const NOTIFICATION_BATCH_SIZE = 10;
    let notifications = [];
    
    // Create notification objects for all bookings
    for (const booking of bookings) {
      // Format the booking time in the user's timezone
      const bookingDateStr = formatInTimeZone(
        new Date(booking.start_time),
        metadata.timezone || 'UTC',
        'dd MMMM HH:mm'
      );
      
      // Notification for client
      notifications.push({
        user_id: metadata.userId,
        streamer_id: parseInt(metadata.streamerId),
        message: `Payment confirmed for your booking on ${bookingDateStr}. Menunggu streamer menerima pesanan Anda.`,
        type: 'booking_payment',
        booking_id: booking.id,
        is_read: false,
        created_at: new Date().toISOString()
      });
      
      // Notification for streamer
      if (streamerData?.user_id) {
        notifications.push({
          user_id: streamerData.user_id,
          streamer_id: parseInt(metadata.streamerId),
          message: `New booking request from ${metadata.firstName} for ${bookingDateStr}. Payment confirmed.`,
          type: 'booking_payment',
          booking_id: booking.id,
          is_read: false,
          created_at: new Date().toISOString()
        });
      }
      
      // Insert in batches if we've collected enough
      if (notifications.length >= NOTIFICATION_BATCH_SIZE) {
        await supabase.from('notifications').insert(notifications);
        notifications = [];
      }
    }
    
    // Insert any remaining notifications
    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications);
    }
    
    console.log(`Created ${bookings.length * 2} notifications asynchronously`);
  } catch (error) {
    console.error('Error creating notifications (non-blocking):', error);
    // Non-blocking - we don't want notification errors to affect booking creation
  }
}