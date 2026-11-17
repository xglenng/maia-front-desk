-- Allow appointments to be assigned to a specific studio location
-- Falls back to studio's primary location if not assigned
ALTER TABLE "appointments" ADD COLUMN "location_id" uuid;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "studio_locations"("id") ON DELETE SET NULL;
