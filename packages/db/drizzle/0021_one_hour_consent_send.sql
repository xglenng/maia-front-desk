-- Expand timing choices without enabling SMS or changing existing artist settings.
ALTER TABLE artists DROP CONSTRAINT artists_appointment_waiver_send_minutes_check;
ALTER TABLE artists ADD CONSTRAINT artists_appointment_waiver_send_minutes_check
 CHECK (appointment_waiver_send_minutes IN (60, 120, 240, 360, 720));
ALTER TABLE artists ALTER COLUMN appointment_waiver_send_minutes SET DEFAULT 60;
