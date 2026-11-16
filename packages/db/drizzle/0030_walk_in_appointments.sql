-- Add isWalkIn flag to appointments table to track walk-in bookings
-- Walk-ins don't require client contact details and skip confirmations/reminders
ALTER TABLE "appointments" ADD COLUMN "is_walk_in" boolean DEFAULT false NOT NULL;
