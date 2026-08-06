import { createClient } from "@/utils/supabase/client";
import { format } from 'date-fns';

// Simple type for notification types matching database exactly
export type NotificationType = 
  | 'info'
  | 'warning'
  | 'confirmation'
  | 'booking_request'
  | 'booking_payment'
  | 'booking_accepted'
  | 'booking_rejected'
  | 'booking_cancelled'
  | 'stream_started'
  | 'stream_ended'
  | 'reschedule_request'
  | 'reschedule_accepted'
  | 'reschedule_rejected'
  | 'item_received'
  | 'new_message';

interface NotificationPayload {
  user_id?: string;
  streamer_id?: number;
  message: string;
  type: NotificationType;
  booking_id?: number;
  is_read: boolean;
}

export async function createNotification(payload: NotificationPayload) {
  const supabase = createClient();
  
  try {
    // Log the payload for debugging
    console.log('Creating notification with payload:', payload);

    // If there's a booking_id, verify it exists first
    if (payload.booking_id) {
      const { data: bookingExists, error: bookingCheckError } = await supabase
        .from('bookings')
        .select('id')
        .eq('id', payload.booking_id)
        .single();

      if (bookingCheckError || !bookingExists) {
        console.error('Booking not found:', payload.booking_id);
        throw new Error(`Booking ${payload.booking_id} not found`);
      }
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        ...payload,
        created_at: new Date().toISOString(),
        is_read: false
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating notification:', error);
      throw error;
    }

    console.log('Successfully created notification:', data);
    return data;
  } catch (error) {
    console.error('Error in createNotification:', error);
    throw error;
  }
}

export async function createStreamNotifications({
  client_id,
  streamer_id,
  booking_id,
  streamer_name,
  start_time,
  platform,
  stream_link,
  type
}: {
  client_id: string;
  streamer_id: number;
  booking_id: number;
  streamer_name: string;
  start_time: string;
  platform: string;
  stream_link?: string;
  type: 'stream_started' | 'stream_ended';
}) {
  try {
    // Validate required fields
    if (!streamer_name) {
      console.error('Missing streamer name in createStreamNotifications');
      throw new Error('Streamer name is required');
    }

    // Create the notification message
    const message = type === 'stream_started'
      ? `${streamer_name} telah memulai live stream untuk booking kamu pada ${start_time} di platform ${platform}${stream_link ? `. Klik untuk bergabung.` : ''}`
      : `${streamer_name} telah mengakhiri live stream untuk booking kamu.`;

    // Create the notification
    return await createNotification({
      user_id: client_id,
      streamer_id,
      message,
      type,
      booking_id,
      is_read: false
    });
  } catch (error) {
    console.error('Error in createStreamNotifications:', error);
    throw error;
  }
}

export async function createItemReceivedNotification({
  client_id,
  streamer_id,
  booking_id,
  streamer_name
}: {
  client_id: string;
  streamer_id: number;
  booking_id: number;
  streamer_name: string;
}) {
  try {
    // Extract first name only
    const firstName = streamer_name.split(' ')[0];
    
    return await createNotification({
      user_id: client_id,
      streamer_id,
      message: `${firstName} telah menerima barang kamu dan siap untuk memulai live streaming.`,
      type: 'item_received',
      booking_id,
      is_read: false
    });
  } catch (error) {
    console.error('Error in createItemReceivedNotification:', error);
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: string) {
  const supabase = createClient();
  
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

export async function markAllNotificationsAsRead(userId: string) {
  const supabase = createClient();
  
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
} 