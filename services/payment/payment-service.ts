import { createClient } from "@/utils/supabase/client";
import midtransClient from 'midtrans-client';
import { createNotification, type NotificationType } from '@/services/notification-service';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
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
  const supabase = createClient();
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
        const startTimeStr = block.start.split('T')[1] || block.start;
        const endTimeStr = block.end.split('T')[1] || block.end;
        
        // Log time details for debugging
        log(`Creating booking with date: ${dateStr}, start: ${startTimeStr}, end: ${endTimeStr}, timezone: ${metadata.timezone}`);
        
        // Create datetime strings for conversion
        const startDateTimeStr = `${dateStr}T${startTimeStr}`;
        const endDateTimeStr = `${dateStr}T${endTimeStr}`;

        // Parse the dates in user's timezone
        const userTz = metadata.timezone || 'UTC';
        
        log(`Converting time with timezone: ${startDateTimeStr} in ${userTz}`);
        
        // IMPROVED: Create Date objects in the local timezone first
        const localStartDate = new Date(startDateTimeStr);
        const localEndDate = new Date(endDateTimeStr);
        
        log(`Local browser interpreted dates: Start=${localStartDate.toISOString()}, End=${localEndDate.toISOString()}`);
        
        // IMPROVED: Get timezone offsets - both in the same convention (minutes EAST of UTC)
        const userOffsetMinutes = getUserTimezoneOffsetMinutes(userTz); // Minutes EAST of UTC
        const serverOffsetMinutes = new Date().getTimezoneOffset(); // Minutes WEST of UTC
        const serverOffsetEast = -serverOffsetMinutes; // Convert to minutes EAST of UTC
        
        log(`Time offsets: User=${userOffsetMinutes}min EAST, Server=${serverOffsetEast}min EAST`);
        
        // FIXED: Calculate the correct adjustment with consistent sign convention
        // Both offsets are now in minutes EAST of UTC
        // The adjustment needed is the difference between user timezone and server timezone
        const totalAdjustmentMinutes = userOffsetMinutes - serverOffsetEast;
        
        log(`Total adjustment: ${totalAdjustmentMinutes} minutes`);
        
        // FIXED: Apply adjustment in the CORRECT direction
        // We need to SUBTRACT the adjustment to get from local time to UTC time
        const startTimeUTC = new Date(localStartDate.getTime() - (totalAdjustmentMinutes * 60000));
        const endTimeUTC = new Date(localEndDate.getTime() - (totalAdjustmentMinutes * 60000));
        
        log(`Adjusted times: 
          Original local: ${localStartDate.toString()}
          Converted UTC: ${startTimeUTC.toISOString()}
          User timezone: ${userTz}
          User offset: ${userOffsetMinutes} minutes EAST
          Server offset: ${serverOffsetEast} minutes EAST
          Adjustment: ${totalAdjustmentMinutes} minutes
          Direction: SUBTRACT (not add)
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
          price: Math.round(metadata.finalPrice / metadata.bookings.length / (timeBlocks.length || 1)),
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

// IMPROVED: Updated timezone offset helper function to include Indonesia and return minutes instead of hours
function getUserTimezoneOffsetMinutes(timezone: string): number {
  // Common timezone offsets (minutes)
  const timezoneOffsets: Record<string, number> = {
    // UTC and GMT
    'UTC': 0,
    'GMT': 0,
    
    // Asia (including Indonesia)
    'Asia/Jakarta': 7 * 60,     // Indonesia - Western Indonesian Time (WIB)
    'Asia/Makassar': 8 * 60,    // Indonesia - Central Indonesian Time (WITA)
    'Asia/Jayapura': 9 * 60,    // Indonesia - Eastern Indonesian Time (WIT)
    'Asia/Singapore': 8 * 60,
    'Asia/Kuala_Lumpur': 8 * 60,
    'Asia/Bangkok': 7 * 60,
    'Asia/Ho_Chi_Minh': 7 * 60,
    'Asia/Manila': 8 * 60,
    'Asia/Tokyo': 9 * 60,
    'Asia/Seoul': 9 * 60,
    'Asia/Shanghai': 8 * 60,
    'Asia/Hong_Kong': 8 * 60,
    'Asia/Taipei': 8 * 60,
    'Asia/Kolkata': 5.5 * 60,
    
    // Europe
    'Europe/London': 0,
    'Europe/Paris': 1 * 60,
    'Europe/Berlin': 1 * 60,
    'Europe/Rome': 1 * 60,
    'Europe/Madrid': 1 * 60,
    
    // North America
    'America/New_York': -5 * 60,    // EST
    'America/Chicago': -6 * 60,     // CST
    'America/Denver': -7 * 60,      // MST
    'America/Los_Angeles': -8 * 60, // PST
    
    // Oceania
    'Australia/Sydney': 10 * 60,
    'Australia/Melbourne': 10 * 60,
    'Australia/Brisbane': 10 * 60,
    'Australia/Perth': 8 * 60,
    'Pacific/Auckland': 12 * 60
  };
  
  // Extract just the timezone ID if it contains multiple parts (like "Etc/GMT+7")
  const timezoneId = timezone.split(' ')[0];
  
  // Try to match the timezone directly
  if (timezoneOffsets[timezoneId] !== undefined) {
    return timezoneOffsets[timezoneId];
  }
  
  // Handle fallback for Indonesian timezones
  if (timezoneId.includes('Indonesia') || timezoneId.includes('jakarta') || timezoneId.includes('Jakarta')) {
    console.log('Detected Indonesian timezone, using Asia/Jakarta offset');
    return 7 * 60; // Jakarta / WIB
  }
  
  // Handle Balikpapan (WITA) specifically
  if (timezoneId.includes('Balikpapan') || timezoneId.includes('WITA') || timezoneId.includes('Makassar')) {
    console.log('Detected Balikpapan or WITA timezone, using Asia/Makassar offset');
    return 8 * 60; // WITA
  }
  
  // Try to guess timezone by offset if provided in format like "GMT+7"
  if (timezone.match(/GMT[+-]\d+/)) {
    const offsetMatch = timezone.match(/GMT([+-]\d+)/);
    if (offsetMatch && offsetMatch[1]) {
      const offsetHours = parseInt(offsetMatch[1]);
      return offsetHours * 60;
    }
  }
  
  console.warn(`Unknown timezone: ${timezone}, defaulting to UTC`);
  return 0; // Default to UTC if timezone not found
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