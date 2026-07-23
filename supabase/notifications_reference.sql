-- First, drop all existing policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "System can create notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update read status of their notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update is_read status of their own notifications" ON notifications;



-- Create enum for notification types (including existing types)
CREATE TYPE notification_type AS ENUM (
    'info',                    -- Keep existing type
    'warning',                 -- Keep existing type
    'confirmation',            -- Keep existing type
    'booking_request',
    'booking_payment',
    'booking_accepted',
    'booking_rejected',
    'booking_cancelled',
    'stream_started',
    'stream_ended',
    'reschedule_request',
    'reschedule_accepted',
    'reschedule_rejected',
    'item_received'
);

-- Now safely convert the type column
ALTER TABLE notifications ALTER COLUMN type TYPE notification_type USING type::notification_type;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_streamer ON notifications(streamer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- Enable RLS if not already enabled
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Recreate the policies
CREATE POLICY "Users can view their own notifications" ON notifications
FOR SELECT USING (
    auth.uid() = user_id OR 
    streamer_id IN (
        SELECT id FROM streamers WHERE user_id = auth.uid()
    )
);

CREATE POLICY "System can create notifications" ON notifications
FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update read status of their notifications" ON notifications
FOR UPDATE USING (
    auth.uid() = user_id OR 
    streamer_id IN (
        SELECT id FROM streamers WHERE user_id = auth.uid()
    )
) WITH CHECK (
    -- Only allow updating is_read field
    (
        auth.uid() = user_id OR 
        streamer_id IN (
            SELECT id FROM streamers WHERE user_id = auth.uid()
        )
    )
);

